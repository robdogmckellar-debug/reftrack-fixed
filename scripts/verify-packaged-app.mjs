import fs from 'node:fs';
import path from 'node:path';

import { extractFile, getRawHeader, listPackage } from '@electron/asar';
import { FuseV1Options, FuseWireState, getCurrentFuseWire } from './lib/electron-fuses.mjs';

import {
  ensureArtifactDirectory,
  resolvePackagedExecutable,
  resolveUnpackedDirectory,
  timestampForFilename,
  writeJson,
} from './lib/packaged-app.mjs';

const unpackedDirectory = resolveUnpackedDirectory(process.argv[2]);
const executablePath = resolvePackagedExecutable(unpackedDirectory);
const asarPath = path.join(unpackedDirectory, 'resources', 'app.asar');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normaliseAsarPath(value) {
  return value.replace(/^[/\\]+/, '').replaceAll('\\', '/');
}

function collectIntegrityProblems(directory, prefix = '') {
  const problems = [];
  for (const [name, entry] of Object.entries(directory.files ?? {})) {
    const currentPath = prefix ? `${prefix}/${name}` : name;
    if ('files' in entry) {
      problems.push(...collectIntegrityProblems(entry, currentPath));
      continue;
    }
    if (!entry.integrity || entry.integrity.algorithm !== 'SHA256' || !entry.integrity.hash) {
      problems.push(currentPath);
    }
  }
  return problems;
}

assert(fs.existsSync(executablePath), `Missing packaged executable: ${executablePath}`);
assert(fs.existsSync(asarPath), `Missing ASAR archive: ${asarPath}`);
assert(
  !fs.existsSync(path.join(unpackedDirectory, 'resources', 'app')),
  'Loose app directory must not exist.',
);

const packageFiles = listPackage(asarPath, { isPack: false }).map(normaliseAsarPath);
const requiredFiles = [
  'package.json',
  'assets/icon.png',
  'out/main/index.js',
  'out/main/importer-worker.js',
  'out/preload/index.js',
  'out/renderer/index.html',
];
for (const required of requiredFiles) {
  assert(packageFiles.includes(required), `Required packaged file is missing: ${required}`);
}

const forbiddenPatterns = [
  /^src\//,
  /^tests\//,
  /^docs\//,
  /^scripts\//,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)electron\.vite\.config\./,
  /(^|\/)vitest\.config\./,
  /(^|\/)eslint\.config\./,
  /(^|\/)prettier\.config\./,
  /\.map$/,
  /^node_modules\/(?:@playwright|vitest|typescript|eslint|prettier)(?:\/|$)/,
];
const forbiddenFiles = packageFiles.filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)),
);
assert(
  forbiddenFiles.length === 0,
  `Development files were packaged: ${forbiddenFiles.join(', ')}`,
);

const packagedMetadata = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
assert(packagedMetadata.main === 'out/main/index.js', 'Packaged main entry is incorrect.');
assert(packagedMetadata.version === '2.0.0', 'Packaged version is not 2.0.0.');

const rawHeader = getRawHeader(asarPath);
const integrityProblems = collectIntegrityProblems(rawHeader.header);
assert(
  integrityProblems.length === 0,
  `ASAR entries without SHA-256 integrity metadata: ${integrityProblems.slice(0, 10).join(', ')}`,
);

const fuseWire = await getCurrentFuseWire(executablePath);
const expectedFuses = new Map([
  [FuseV1Options.RunAsNode, FuseWireState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseWireState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseWireState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseWireState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseWireState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseWireState.ENABLE],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseWireState.DISABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseWireState.DISABLE],
]);
for (const [fuse, expected] of expectedFuses) {
  assert(
    fuseWire[fuse] === expected,
    `Electron fuse ${fuse} has state ${fuseWire[fuse]}, expected ${expected}.`,
  );
}

const localeDirectory = path.join(unpackedDirectory, 'locales');
const locales = fs.existsSync(localeDirectory)
  ? fs
      .readdirSync(localeDirectory)
      .filter((name) => name.endsWith('.pak'))
      .sort()
  : [];
assert(locales.includes('en-US.pak'), 'The en-US Electron locale is missing.');
assert(locales.length === 1, `Unexpected Electron locales were packaged: ${locales.join(', ')}`);

const report = {
  verifiedAt: new Date().toISOString(),
  unpackedDirectory,
  executablePath,
  asarPath,
  packagedVersion: packagedMetadata.version,
  packagedFileCount: packageFiles.length,
  asarIntegrityEntriesChecked: packageFiles.length,
  locales,
  expectedFuses: Object.fromEntries(
    [...expectedFuses].map(([key, value]) => [FuseV1Options[key], value === FuseWireState.ENABLE]),
  ),
  status: 'passed',
};
const reportDirectory = await ensureArtifactDirectory('package');
const reportPath = path.join(reportDirectory, `verification-${timestampForFilename()}.json`);
await writeJson(reportPath, report);
console.log(`Packaged application verification passed: ${reportPath}`);
