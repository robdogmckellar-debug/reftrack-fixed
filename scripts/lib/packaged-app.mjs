import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const distDirectory = path.join(projectRoot, 'dist');
export const artifactsDirectory = path.join(projectRoot, 'artifacts');

export function resolveUnpackedDirectory(explicitPath = process.env.REFTRACK_PACKAGED_DIR) {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  candidates.push(path.join(distDirectory, 'win-unpacked'));
  candidates.push(path.join(distDirectory, 'win-x64-unpacked'));

  if (fs.existsSync(distDirectory)) {
    for (const entry of fs.readdirSync(distDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && /^win.*unpacked$/i.test(entry.name)) {
        candidates.push(path.join(distDirectory, entry.name));
      }
    }
  }

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      'Could not find the unpacked Windows application. Run `npm run package:dir` or `npm run package:win` first.',
    );
  }
  return found;
}

export function resolvePackagedExecutable(unpackedDirectory = resolveUnpackedDirectory()) {
  const preferred = path.join(unpackedDirectory, 'RefTrack.exe');
  if (fs.existsSync(preferred)) return preferred;

  const executable = fs
    .readdirSync(unpackedDirectory, { withFileTypes: true })
    .find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'));
  if (!executable) throw new Error(`No packaged executable was found in ${unpackedDirectory}.`);
  return path.join(unpackedDirectory, executable.name);
}

export function requireWindowsHost() {
  if (process.platform !== 'win32') {
    throw new Error('This packaged runtime check must be run on Windows 11.');
  }
}

export async function ensureArtifactDirectory(name) {
  const directory = path.join(artifactsDirectory, name);
  await fsPromises.mkdir(directory, { recursive: true });
  return directory;
}

export function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export async function writeJson(filePath, value) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
