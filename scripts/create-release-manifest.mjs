import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  distDirectory,
  projectRoot,
  timestampForFilename,
  writeJson,
} from './lib/packaged-app.mjs';

const metadata = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
if (!fs.existsSync(distDirectory))
  throw new Error('The dist directory does not exist. Build the Windows release first.');

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

const artifacts = fs
  .readdirSync(distDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(exe|blockmap|yml)$/i.test(entry.name))
  .map((entry) => {
    const filePath = path.join(distDirectory, entry.name);
    return { name: entry.name, sizeBytes: fs.statSync(filePath).size, sha256: sha256(filePath) };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

if (!artifacts.some((artifact) => /Setup-.*\.exe$/i.test(artifact.name)))
  throw new Error('NSIS installer artifact is missing.');
if (!artifacts.some((artifact) => /Portable-.*\.exe$/i.test(artifact.name)))
  throw new Error('Portable artifact is missing.');

const manifest = {
  generatedAt: new Date().toISOString(),
  productName: 'RefTrack',
  version: metadata.version,
  target: { os: 'Windows 11', architecture: 'x64' },
  signed: false,
  autoUpdate: false,
  runtime: { electron: metadata.devDependencies.electron },
  artifacts,
};
const manifestPath = path.join(distDirectory, `RefTrack-${metadata.version}-release-manifest.json`);
await writeJson(manifestPath, manifest);
const sumsPath = path.join(distDirectory, `RefTrack-${metadata.version}-SHA256SUMS.txt`);
fs.writeFileSync(
  sumsPath,
  `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join('\n')}\n`,
  'utf8',
);
console.log(`Release manifest: ${manifestPath}`);
console.log(`Checksums: ${sumsPath}`);
