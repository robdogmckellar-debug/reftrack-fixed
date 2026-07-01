import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ImageCleanupCompletedEvent,
  ImageCleanupFailureDetail,
  ImageCleanupStart,
} from '../../shared/ipc/contract';
import { ApplicationError } from './application-error';

const execFile = promisify(execFileCallback);

const MAX_REPORTED_FAILURES = 10;
const SIGNATURE_BYTES = 12;

const IMAGE_EXTENSION_KIND = new Map<string, ImageKind>([
  ['.png', 'png'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg'],
  ['.jfif', 'jpeg'],
  ['.webp', 'webp'],
  ['.gif', 'gif'],
  ['.bmp', 'bmp'],
  ['.tif', 'tiff'],
  ['.tiff', 'tiff'],
]);

export const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze([...IMAGE_EXTENSION_KIND.keys()]);

type ImageKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp' | 'tiff';

interface FileFingerprint {
  device: bigint;
  inode: bigint;
  size: bigint;
  modifiedNanoseconds: bigint;
}

export interface ImageCleanupSummary {
  folderPath: string;
  scanned: number;
  eligible: number;
  movedToRecycleBin: number;
  skipped: number;
  failed: number;
  failures: ImageCleanupFailureDetail[];
}

export interface ImageCleanerServiceOptions {
  trashItem(filePath: string): Promise<void>;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  getProtectedFileNames?(folderPath: string): Promise<ReadonlySet<string>>;
}

export class ImageCleanerService {
  private readonly platform: NodeJS.Platform;
  private readonly homeDirectory: string;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly getProtectedFileNames: (folderPath: string) => Promise<ReadonlySet<string>>;

  constructor(private readonly options: ImageCleanerServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.homeDirectory = options.homeDirectory ?? os.homedir();
    this.environment = options.environment ?? process.env;
    this.getProtectedFileNames =
      options.getProtectedFileNames ??
      ((folderPath) => readProtectedWindowsFileNames(folderPath, this.platform, this.environment));
  }

  async validateFolder(folderPath: string): Promise<string> {
    const requestedPath = folderPath.trim();
    if (!requestedPath || !path.isAbsolute(requestedPath)) {
      throw new ApplicationError('UNSAFE_PATH', 'Choose an absolute folder path.', {
        field: 'folderPath',
        recoverable: true,
      });
    }
    if (
      this.platform === 'win32' &&
      (requestedPath.startsWith('\\\\') ||
        requestedPath.startsWith('\\\\?\\') ||
        requestedPath.startsWith('\\\\.\\'))
    ) {
      throw new ApplicationError(
        'UNSAFE_PATH',
        'Choose a folder on a normal local Windows drive, not a network or device path.',
        {
          field: 'folderPath',
          recoverable: true,
        },
      );
    }

    const resolvedPath = path.resolve(requestedPath);
    let requestedInfo;
    try {
      requestedInfo = await lstat(resolvedPath);
    } catch (error: unknown) {
      throw new ApplicationError('FOLDER_UNAVAILABLE', 'The selected folder is unavailable.', {
        field: 'folderPath',
        recoverable: true,
        cause: error,
      });
    }

    if (requestedInfo.isSymbolicLink() || !requestedInfo.isDirectory()) {
      throw new ApplicationError(
        'UNSAFE_PATH',
        'Choose a normal local folder, not a link or file.',
        {
          field: 'folderPath',
          recoverable: true,
        },
      );
    }

    let canonicalPath;
    try {
      canonicalPath = await realpath(resolvedPath);
    } catch (error: unknown) {
      throw new ApplicationError(
        'FOLDER_UNAVAILABLE',
        'The selected folder could not be resolved.',
        {
          field: 'folderPath',
          recoverable: true,
          cause: error,
        },
      );
    }

    let canonicalInfo;
    try {
      canonicalInfo = await lstat(canonicalPath);
    } catch (error: unknown) {
      throw new ApplicationError('FOLDER_UNAVAILABLE', 'The selected folder is unavailable.', {
        field: 'folderPath',
        recoverable: true,
        cause: error,
      });
    }

    if (canonicalInfo.isSymbolicLink() || !canonicalInfo.isDirectory()) {
      throw new ApplicationError(
        'UNSAFE_PATH',
        'Choose a normal local folder, not a link or file.',
        {
          field: 'folderPath',
          recoverable: true,
        },
      );
    }

    if (this.isProtectedFolder(canonicalPath)) {
      throw new ApplicationError(
        'UNSAFE_PATH',
        'That folder is too broad or system-sensitive. Choose a dedicated screenshots or exports subfolder.',
        {
          field: 'folderPath',
          recoverable: true,
        },
      );
    }

    return canonicalPath;
  }

  async cleanFolder(folderPath: string): Promise<ImageCleanupSummary> {
    const canonicalFolder = await this.validateFolder(folderPath);
    const entries = await readdir(canonicalFolder, { withFileTypes: true });
    let protectedFileNames: ReadonlySet<string>;
    try {
      protectedFileNames = await this.getProtectedFileNames(canonicalFolder);
    } catch (error: unknown) {
      throw new ApplicationError(
        'IMAGE_CLEANUP_FAILED',
        'Windows file attributes could not be checked safely, so no images were moved.',
        { recoverable: true, cause: error },
      );
    }
    const result: ImageCleanupSummary = {
      folderPath: canonicalFolder,
      scanned: entries.length,
      eligible: 0,
      movedToRecycleBin: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    };

    for (const entry of entries) {
      const comparisonName =
        this.platform === 'win32' ? entry.name.toLocaleLowerCase() : entry.name;
      if (
        entry.name.startsWith('.') ||
        protectedFileNames.has(comparisonName) ||
        !entry.isFile() ||
        entry.isSymbolicLink()
      ) {
        result.skipped += 1;
        continue;
      }

      const kind = IMAGE_EXTENSION_KIND.get(path.extname(entry.name).toLocaleLowerCase());
      if (!kind) {
        result.skipped += 1;
        continue;
      }

      const filePath = path.join(canonicalFolder, entry.name);
      try {
        const initialInfo = await lstat(filePath, { bigint: true });
        if (initialInfo.isSymbolicLink() || !initialInfo.isFile()) {
          result.skipped += 1;
          continue;
        }

        if (!(await hasExpectedImageSignature(filePath, kind))) {
          result.skipped += 1;
          continue;
        }

        result.eligible += 1;
        const fingerprint = toFingerprint(initialInfo);
        const currentInfo = await lstat(filePath, { bigint: true });
        if (
          currentInfo.isSymbolicLink() ||
          !currentInfo.isFile() ||
          !sameFingerprint(fingerprint, toFingerprint(currentInfo))
        ) {
          throw new Error('The file changed while it was being checked.');
        }

        await this.options.trashItem(filePath);
        result.movedToRecycleBin += 1;
      } catch (error: unknown) {
        result.failed += 1;
        addFailure(result.failures, entry.name, error);
      }
    }

    return result;
  }

  private isProtectedFolder(folderPath: string): boolean {
    const normalised = normaliseForComparison(folderPath, this.platform);
    const parsedPath = path.parse(folderPath);
    const root = normaliseForComparison(parsedPath.root, this.platform);
    if (normalised === root) return true;

    const broadLibraryNames = new Set([
      'desktop',
      'documents',
      'downloads',
      'pictures',
      'music',
      'videos',
    ]);
    if (
      normaliseForComparison(parsedPath.dir, this.platform) === root &&
      broadLibraryNames.has(parsedPath.base.toLocaleLowerCase())
    ) {
      return true;
    }

    const candidates = new Set<string>();
    addProtectedPath(candidates, this.homeDirectory, this.platform);

    const environmentKeys = [
      'USERPROFILE',
      'SystemRoot',
      'WINDIR',
      'ProgramFiles',
      'ProgramFiles(x86)',
      'ProgramData',
      'APPDATA',
      'LOCALAPPDATA',
      'OneDrive',
      'OneDriveConsumer',
      'OneDriveCommercial',
    ];
    for (const key of environmentKeys) {
      addProtectedPath(candidates, this.environment[key], this.platform);
    }

    const personalLibraryRoots = [
      this.homeDirectory,
      this.environment.OneDrive,
      this.environment.OneDriveConsumer,
      this.environment.OneDriveCommercial,
    ];
    for (const libraryRoot of personalLibraryRoots) {
      if (!libraryRoot) continue;
      for (const folderName of [
        'Desktop',
        'Documents',
        'Downloads',
        'Pictures',
        'Music',
        'Videos',
      ]) {
        addProtectedPath(candidates, path.join(libraryRoot, folderName), this.platform);
      }
    }

    return candidates.has(normalised);
  }
}

export interface ImageCleanupCoordinatorOptions {
  cleaner: ImageCleanerService;
  onCompleted(event: ImageCleanupCompletedEvent): void;
  now?: () => Date;
  createJobId?: () => string;
}

export class ImageCleanupCoordinator {
  private activeJob: { jobId: string; promise: Promise<void> } | null = null;
  private readonly now: () => Date;
  private readonly createJobId: () => string;

  constructor(private readonly options: ImageCleanupCoordinatorOptions) {
    this.now = options.now ?? (() => new Date());
    this.createJobId = options.createJobId ?? (() => `cleanup_${randomUUID()}`);
  }

  start(folderPath: string): ImageCleanupStart {
    if (this.activeJob) {
      return { status: 'busy', jobId: this.activeJob.jobId };
    }

    const jobId = this.createJobId();
    const startedAt = this.now().toISOString();
    const promise = this.runJob(jobId, folderPath, startedAt).finally(() => {
      if (this.activeJob?.jobId === jobId) this.activeJob = null;
    });
    this.activeJob = { jobId, promise };
    return { status: 'started', jobId };
  }

  async waitForIdle(): Promise<void> {
    await this.activeJob?.promise;
  }

  private async runJob(jobId: string, folderPath: string, startedAt: string): Promise<void> {
    try {
      const summary = await this.options.cleaner.cleanFolder(folderPath);
      this.emitCompleted({
        jobId,
        folderPath: summary.folderPath,
        startedAt,
        completedAt: this.now().toISOString(),
        ok: summary.failed === 0,
        scanned: summary.scanned,
        eligible: summary.eligible,
        movedToRecycleBin: summary.movedToRecycleBin,
        skipped: summary.skipped,
        failed: summary.failed,
        failures: summary.failures,
        errorCode: null,
        errorMessage: null,
      });
    } catch (error: unknown) {
      const applicationError =
        error instanceof ApplicationError
          ? error
          : new ApplicationError('IMAGE_CLEANUP_FAILED', 'Image cleanup could not be completed.', {
              recoverable: true,
              cause: error,
            });
      this.emitCompleted({
        jobId,
        folderPath,
        startedAt,
        completedAt: this.now().toISOString(),
        ok: false,
        scanned: 0,
        eligible: 0,
        movedToRecycleBin: 0,
        skipped: 0,
        failed: 0,
        failures: [],
        errorCode: applicationError.code,
        errorMessage: applicationError.message,
      });
    }
  }

  private emitCompleted(event: ImageCleanupCompletedEvent): void {
    try {
      this.options.onCompleted(event);
    } catch (error: unknown) {
      console.error('[RefTrack] Could not deliver image-cleanup completion:', error);
    }
  }
}

async function hasExpectedImageSignature(filePath: string, kind: ImageKind): Promise<boolean> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(SIGNATURE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    return matchesImageSignature(bytes, kind);
  } finally {
    await handle.close();
  }
}

export function matchesImageSignature(bytes: Uint8Array, kind: ImageKind): boolean {
  switch (kind) {
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'gif':
      return ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a';
    case 'bmp':
      return ascii(bytes, 0, 2) === 'BM';
    case 'webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
    case 'tiff':
      return (
        startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
      );
  }
}

function startsWith(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return '';
  return Buffer.from(bytes.subarray(offset, offset + length)).toString('ascii');
}

function toFingerprint(info: {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
}): FileFingerprint {
  return {
    device: info.dev,
    inode: info.ino,
    size: info.size,
    modifiedNanoseconds: info.mtimeNs,
  };
}

function sameFingerprint(left: FileFingerprint, right: FileFingerprint): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedNanoseconds === right.modifiedNanoseconds
  );
}

function addFailure(failures: ImageCleanupFailureDetail[], fileName: string, error: unknown): void {
  if (failures.length >= MAX_REPORTED_FAILURES) return;
  failures.push({
    fileName,
    reason:
      error instanceof Error && error.message ? error.message : 'Windows could not recycle it.',
  });
}

function addProtectedPath(
  candidates: Set<string>,
  candidate: string | undefined,
  platform: NodeJS.Platform,
): void {
  if (!candidate || !path.isAbsolute(candidate)) return;
  candidates.add(normaliseForComparison(path.resolve(candidate), platform));
}

function normaliseForComparison(value: string, platform: NodeJS.Platform): string {
  const normalised = path.normalize(value).replace(/[\\/]+$/, '') || path.parse(value).root;
  return platform === 'win32' ? normalised.toLocaleLowerCase() : normalised;
}

async function readProtectedWindowsFileNames(
  folderPath: string,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): Promise<ReadonlySet<string>> {
  if (platform !== 'win32') return new Set<string>();

  const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$folder = $env:REFTRACK_IMAGE_CLEANER_FOLDER
$items = @(
  Get-ChildItem -LiteralPath $folder -Force -File -ErrorAction Stop |
    Where-Object {
      (($_.Attributes -band [IO.FileAttributes]::Hidden) -ne 0) -or
      (($_.Attributes -band [IO.FileAttributes]::System) -ne 0)
    } |
    ForEach-Object { $_.Name }
)
[Console]::Out.Write((ConvertTo-Json -InputObject $items -Compress))
`;
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
    {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      env: {
        ...environment,
        REFTRACK_IMAGE_CLEANER_FOLDER: folderPath,
      },
    },
  );

  const parsed: unknown = JSON.parse(stdout.trim() || '[]');
  const names = Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed];
  return new Set(
    names
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.toLocaleLowerCase()),
  );
}
