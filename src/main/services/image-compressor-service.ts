import { randomUUID } from 'node:crypto';
import { watch, type BigIntStats, type FSWatcher } from 'node:fs';
import { access, lstat, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ApplicationError } from './application-error';

const COMPRESSED_SUFFIX = '.reftrack';
const JPEG_EXTENSION = '.jpg';
const SUPPORTED_INPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.bmp']);

interface FileFingerprint {
  size: bigint;
  modifiedNanoseconds: bigint;
}

export interface ImageCompressorServiceOptions {
  convertToJpeg(filePath: string, quality: number): Promise<Buffer>;
  wait?: (milliseconds: number) => Promise<void>;
  stableDelayMs?: number;
}

export interface ImageCompressionResult {
  inputPath: string;
  outputPath: string;
  deletedOriginal: boolean;
}

export class ImageCompressorService {
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly stableDelayMs: number;

  constructor(private readonly options: ImageCompressorServiceOptions) {
    this.wait =
      options.wait ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.stableDelayMs = options.stableDelayMs ?? 450;
  }

  async compressFile(
    folderPath: string,
    fileName: string,
    quality: number,
  ): Promise<ImageCompressionResult | null> {
    if (!isCompressibleFileName(fileName)) return null;

    const inputPath = path.join(folderPath, fileName);
    const resolvedInput = path.resolve(inputPath);
    if (path.dirname(resolvedInput) !== path.resolve(folderPath)) return null;

    const initialInfo = await lstat(resolvedInput, { bigint: true });
    if (initialInfo.isSymbolicLink() || !initialInfo.isFile()) return null;

    const fingerprint = await this.waitForStableFile(resolvedInput, initialInfo);
    const outputPath = await nextOutputPath(folderPath, fileName);
    const tempPath = `${outputPath}.${randomUUID()}.tmp`;
    const jpeg = await this.options.convertToJpeg(resolvedInput, quality);
    if (jpeg.length === 0) {
      throw new ApplicationError('IMAGE_COMPRESSION_FAILED', 'That image could not be converted.', {
        field: 'folderPath',
        recoverable: true,
      });
    }

    const currentInfo = await lstat(resolvedInput, { bigint: true });
    if (
      currentInfo.isSymbolicLink() ||
      !currentInfo.isFile() ||
      !sameFingerprint(fingerprint, toFingerprint(currentInfo))
    ) {
      throw new ApplicationError(
        'IMAGE_COMPRESSION_FAILED',
        'The image changed while it was being compressed.',
        { field: 'folderPath', recoverable: true },
      );
    }

    await writeFile(tempPath, jpeg, { flag: 'wx' });
    await rename(tempPath, outputPath);
    await unlink(resolvedInput);

    return { inputPath: resolvedInput, outputPath, deletedOriginal: true };
  }

  private async waitForStableFile(
    filePath: string,
    initialInfo: BigIntStats,
  ): Promise<FileFingerprint> {
    const first = toFingerprint(initialInfo);
    if (this.stableDelayMs > 0) await this.wait(this.stableDelayMs);
    const secondInfo = await lstat(filePath, { bigint: true });
    const second = toFingerprint(secondInfo);
    if (secondInfo.isSymbolicLink() || !secondInfo.isFile() || !sameFingerprint(first, second)) {
      throw new ApplicationError(
        'IMAGE_COMPRESSION_FAILED',
        'The image is still being copied. RefTrack will try again shortly.',
        { field: 'folderPath', recoverable: true },
      );
    }
    return second;
  }
}

export interface ImageCompressorWatcherOptions {
  service: ImageCompressorService;
  onError?(error: unknown): void;
  debounceMs?: number;
}

export class ImageCompressorWatcher {
  private watcher: FSWatcher | null = null;
  private folderPath: string | null = null;
  private quality = 70;
  private readonly debounceMs: number;
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(private readonly options: ImageCompressorWatcherOptions) {
    this.debounceMs = options.debounceMs ?? 800;
  }

  start(folderPath: string, quality: number): void {
    const resolvedFolder = path.resolve(folderPath);
    if (this.folderPath === resolvedFolder && this.quality === quality && this.watcher) return;
    this.dispose();
    this.folderPath = resolvedFolder;
    this.quality = quality;
    this.watcher = watch(resolvedFolder, (eventType, fileName) => {
      if (!fileName || (eventType !== 'rename' && eventType !== 'change')) return;
      this.schedule(String(fileName));
    });
  }

  async processExistingForTest(): Promise<void> {
    if (!this.folderPath) return;
    for (const entry of await readdir(this.folderPath, { withFileTypes: true })) {
      if (entry.isFile()) await this.process(entry.name);
    }
  }

  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.watcher?.close();
    this.watcher = null;
    this.folderPath = null;
  }

  private schedule(fileName: string): void {
    if (!isCompressibleFileName(fileName)) return;
    const existing = this.pending.get(fileName);
    if (existing) clearTimeout(existing);
    this.pending.set(
      fileName,
      setTimeout(() => void this.process(fileName), this.debounceMs),
    );
  }

  private async process(fileName: string): Promise<void> {
    const folderPath = this.folderPath;
    if (!folderPath) return;
    this.pending.delete(fileName);
    try {
      await this.options.service.compressFile(folderPath, fileName, this.quality);
    } catch (error: unknown) {
      this.options.onError?.(error);
    }
  }
}

function isCompressibleFileName(fileName: string): boolean {
  if (fileName.startsWith('.')) return false;
  const extension = path.extname(fileName).toLocaleLowerCase();
  if (!SUPPORTED_INPUT_EXTENSIONS.has(extension)) return false;
  const basename = path.basename(fileName, extension).toLocaleLowerCase();
  return !basename.endsWith(COMPRESSED_SUFFIX);
}

async function nextOutputPath(folderPath: string, inputFileName: string): Promise<string> {
  const extension = path.extname(inputFileName);
  const basename = path.basename(inputFileName, extension);
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`;
    const candidate = path.join(
      folderPath,
      `${basename}${COMPRESSED_SUFFIX}${suffix}${JPEG_EXTENSION}`,
    );
    if (!(await exists(candidate))) return candidate;
  }
  throw new ApplicationError(
    'IMAGE_COMPRESSION_FAILED',
    'RefTrack could not choose a unique compressed filename.',
    { field: 'folderPath', recoverable: true },
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toFingerprint(info: BigIntStats): FileFingerprint {
  return {
    size: info.size,
    modifiedNanoseconds: info.mtimeNs,
  };
}

function sameFingerprint(left: FileFingerprint, right: FileFingerprint): boolean {
  return left.size === right.size && left.modifiedNanoseconds === right.modifiedNanoseconds;
}
