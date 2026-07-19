import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageCompressorService } from '../../src/main/services/image-compressor-service';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reftrack-compressor-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('image compressor service', () => {
  it('writes a lower-quality JPG and deletes the original only after conversion succeeds', async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = path.join(directory, 'photo.png');
    const outputPath = path.join(directory, 'photo.reftrack.jpg');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
    const convertToJpeg = vi.fn().mockResolvedValue(jpeg);
    await writeFile(inputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const service = new ImageCompressorService({
      convertToJpeg,
      stableDelayMs: 0,
    });

    const result = await service.compressFile(directory, 'photo.png', 70);

    expect(result).toEqual({
      inputPath,
      outputPath,
      deletedOriginal: true,
    });
    expect(convertToJpeg).toHaveBeenCalledWith(inputPath, 70);
    expect(await exists(inputPath)).toBe(false);
    expect(await readFile(outputPath)).toEqual(jpeg);
  });

  it('keeps the original photo when conversion fails', async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = path.join(directory, 'photo.png');
    await writeFile(inputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const service = new ImageCompressorService({
      convertToJpeg: vi.fn().mockRejectedValue(new Error('decode failed')),
      stableDelayMs: 0,
    });

    await expect(service.compressFile(directory, 'photo.png', 70)).rejects.toThrow('decode failed');
    expect(await exists(inputPath)).toBe(true);
    expect(await exists(path.join(directory, 'photo.reftrack.jpg'))).toBe(false);
  });

  it('chooses a numbered output filename instead of overwriting an existing compressed JPG', async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = path.join(directory, 'photo.jpeg');
    const existingOutput = path.join(directory, 'photo.reftrack.jpg');
    const nextOutput = path.join(directory, 'photo.reftrack-1.jpg');
    await writeFile(inputPath, Buffer.from([0xff, 0xd8, 0xff]));
    await writeFile(existingOutput, Buffer.from('existing'));

    const service = new ImageCompressorService({
      convertToJpeg: vi.fn().mockResolvedValue(Buffer.from('compressed')),
      stableDelayMs: 0,
    });

    const result = await service.compressFile(directory, 'photo.jpeg', 60);

    expect(result?.outputPath).toBe(nextOutput);
    expect(await readFile(existingOutput, 'utf8')).toBe('existing');
    expect(await readFile(nextOutput, 'utf8')).toBe('compressed');
    expect(await exists(inputPath)).toBe(false);
  });

  it('ignores already-compressed JPG files and files outside the watched folder', async () => {
    const directory = await createTemporaryDirectory();
    const convertToJpeg = vi.fn();
    const service = new ImageCompressorService({
      convertToJpeg,
      stableDelayMs: 0,
    });

    expect(await service.compressFile(directory, 'photo.reftrack.jpg', 70)).toBeNull();
    expect(await service.compressFile(directory, '..\\outside.png', 70)).toBeNull();
    expect(convertToJpeg).not.toHaveBeenCalled();
  });
});
