import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ImageCleanerService,
  ImageCleanupCoordinator,
  matchesImageSignature,
} from '../../src/main/services/image-cleaner-service';
import { ApplicationError } from '../../src/main/services/application-error';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reftrack-cleaner-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function createDirectoryLink(target: string, linkPath: string): Promise<void> {
  await symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('safe image cleaner', () => {
  it('moves only verified top-level image files and never scans directories', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, 'screenshot.png'), pngBytes());
    await writeFile(path.join(directory, 'photo.jpg'), jpegBytes());
    await writeFile(path.join(directory, 'fake.png'), 'this is not a PNG');
    await writeFile(path.join(directory, 'notes.txt'), 'keep me');
    await writeFile(path.join(directory, '.hidden.png'), pngBytes());
    await mkdir(path.join(directory, 'nested'));
    await writeFile(path.join(directory, 'nested', 'inside.png'), pngBytes());

    const recycled: string[] = [];
    const cleaner = new ImageCleanerService({
      trashItem: async (filePath) => {
        recycled.push(path.basename(filePath));
      },
      homeDirectory: os.homedir(),
      environment: {},
    });

    const result = await cleaner.cleanFolder(directory);

    expect(recycled.sort()).toEqual(['photo.jpg', 'screenshot.png']);
    expect(result).toMatchObject({
      scanned: 6,
      eligible: 2,
      movedToRecycleBin: 2,
      skipped: 4,
      failed: 0,
    });
    expect(recycled).not.toContain('inside.png');
  });

  it('skips files reported with hidden or system attributes', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, 'visible.png'), pngBytes());
    await writeFile(path.join(directory, 'system.png'), pngBytes());

    const recycled: string[] = [];
    const cleaner = new ImageCleanerService({
      trashItem: async (filePath) => {
        recycled.push(path.basename(filePath));
      },
      homeDirectory: os.homedir(),
      environment: {},
      getProtectedFileNames: async () => new Set(['system.png']),
    });

    const result = await cleaner.cleanFolder(directory);

    expect(recycled).toEqual(['visible.png']);
    expect(result).toMatchObject({
      scanned: 2,
      eligible: 1,
      movedToRecycleBin: 1,
      skipped: 1,
      failed: 0,
    });
  });

  it('moves nothing when hidden/system attributes cannot be checked safely', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, 'shot.png'), pngBytes());
    const trashItem = vi.fn();
    const cleaner = new ImageCleanerService({
      trashItem,
      homeDirectory: os.homedir(),
      environment: {},
      getProtectedFileNames: async () => {
        throw new Error('attribute query failed');
      },
    });

    await expect(cleaner.cleanFolder(directory)).rejects.toMatchObject({
      code: 'IMAGE_CLEANUP_FAILED',
    } satisfies Partial<ApplicationError>);
    expect(trashItem).not.toHaveBeenCalled();
  });

  it('continues after a Recycle Bin failure and reports the affected filename', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, 'first.png'), pngBytes());
    await writeFile(path.join(directory, 'second.jpg'), jpegBytes());

    const cleaner = new ImageCleanerService({
      trashItem: async (filePath) => {
        if (filePath.endsWith('second.jpg')) throw new Error('File is locked');
      },
      homeDirectory: os.homedir(),
      environment: {},
    });

    const result = await cleaner.cleanFolder(directory);

    expect(result.movedToRecycleBin).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([{ fileName: 'second.jpg', reason: 'File is locked' }]);
  });

  it('rejects filesystem roots, broad personal folders, and linked folders', async () => {
    const directory = await createTemporaryDirectory();
    const dedicated = path.join(directory, 'screenshots');
    const linked = path.join(directory, 'linked');
    await mkdir(dedicated);
    await createDirectoryLink(dedicated, linked);

    const cleaner = new ImageCleanerService({
      trashItem: async () => undefined,
      homeDirectory: directory,
      environment: {},
    });

    await expect(cleaner.validateFolder(path.parse(directory).root)).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    } satisfies Partial<ApplicationError>);
    await expect(cleaner.validateFolder(directory)).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    } satisfies Partial<ApplicationError>);
    await expect(cleaner.validateFolder(linked)).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    } satisfies Partial<ApplicationError>);
    await expect(cleaner.validateFolder(dedicated)).resolves.toBe(await pathForReal(dedicated));
  });

  it('recognises the approved image signatures', () => {
    expect(matchesImageSignature(pngBytes(), 'png')).toBe(true);
    expect(matchesImageSignature(jpegBytes(), 'jpeg')).toBe(true);
    expect(matchesImageSignature(Buffer.from('GIF89a'), 'gif')).toBe(true);
    expect(matchesImageSignature(Buffer.from('BM'), 'bmp')).toBe(true);
    expect(matchesImageSignature(Buffer.from('RIFFxxxxWEBP'), 'webp')).toBe(true);
    expect(matchesImageSignature(Buffer.from([0x49, 0x49, 0x2a, 0x00]), 'tiff')).toBe(true);
    expect(matchesImageSignature(Buffer.from('not an image'), 'png')).toBe(false);
  });
});

describe('image cleanup coordinator', () => {
  it('allows only one cleanup job at a time and emits an accurate completion event', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, 'shot.png'), pngBytes());

    let releaseTrash: (() => void) | undefined;
    const trashGate = new Promise<void>((resolve) => {
      releaseTrash = resolve;
    });
    const cleaner = new ImageCleanerService({
      trashItem: async () => trashGate,
      homeDirectory: os.homedir(),
      environment: {},
    });
    const completed = vi.fn();
    const coordinator = new ImageCleanupCoordinator({
      cleaner,
      onCompleted: completed,
      createJobId: () => 'cleanup-test',
      now: (() => {
        let call = 0;
        return () =>
          new Date(call++ === 0 ? '2026-07-01T00:00:00.000Z' : '2026-07-01T00:00:01.000Z');
      })(),
    });

    expect(coordinator.start(directory)).toEqual({ status: 'started', jobId: 'cleanup-test' });
    expect(coordinator.start(directory)).toEqual({ status: 'busy', jobId: 'cleanup-test' });

    releaseTrash?.();
    await coordinator.waitForIdle();

    expect(completed).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'cleanup-test',
        ok: true,
        scanned: 1,
        eligible: 1,
        movedToRecycleBin: 1,
        skipped: 0,
        failed: 0,
      }),
    );
  });
});

async function pathForReal(value: string): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(value);
}
