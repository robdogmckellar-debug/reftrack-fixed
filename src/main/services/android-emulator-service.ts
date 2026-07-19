import { execFile as execFileCallback, spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';

import { ApplicationError } from './application-error';

const execFile = promisify(execFileCallback);
const ANDROID_PACKAGE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const DEFAULT_BOOT_TIMEOUT_MS = 180000;
const DEFAULT_ADB_TIMEOUT_MS = 120000;
const BOOT_POLL_INTERVAL_MS = 2000;

type CommandResult = { stdout: string | Buffer; stderr: string | Buffer };
type CommandRunner = (
  file: string,
  args: readonly string[],
  options: { windowsHide: true; timeout: number },
) => Promise<CommandResult>;
type ProcessStarter = (file: string, args: readonly string[]) => void;

interface AndroidEmulatorServiceOptions {
  adbExecutable?: string;
  emulatorExecutable?: string;
  environment?: NodeJS.ProcessEnv;
  runCommand?: CommandRunner;
  startProcess?: ProcessStarter;
  sleep?: (milliseconds: number) => Promise<void>;
  bootTimeoutMs?: number;
}

export class AndroidEmulatorService {
  private readonly options: AndroidEmulatorServiceOptions;

  constructor(options: string | AndroidEmulatorServiceOptions = {}) {
    this.options = typeof options === 'string' ? { adbExecutable: options } : options;
  }

  async installApk(apkPath: string, avdName?: string | null): Promise<string | null> {
    const resolvedPath = path.resolve(apkPath);
    if (path.extname(resolvedPath).toLowerCase() !== '.apk') {
      throw new ApplicationError('VALIDATION_FAILED', 'Choose an APK file.', {
        field: 'apkPath',
        recoverable: true,
      });
    }
    await assertAccessibleFile(resolvedPath, 'apkPath');
    const packageName = await readApkPackageName(resolvedPath).catch(() => null);
    await this.ensureDeviceReady(avdName);
    await this.runAdb(['install', '-r', resolvedPath]);
    return packageName;
  }

  async launchPackage(packageName: string, avdName?: string | null): Promise<void> {
    const normalised = normalisePackageName(packageName);
    await this.ensureDeviceReady(avdName);
    await this.runAdb([
      'shell',
      'monkey',
      '-p',
      normalised,
      '-c',
      'android.intent.category.LAUNCHER',
      '1',
    ]);
  }

  async openDeepLink(url: string, avdName?: string | null): Promise<void> {
    const normalised = normaliseDeepLink(url);
    await this.ensureDeviceReady(avdName);
    await this.runAdb([
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      normalised,
    ]);
  }

  private async ensureDeviceReady(avdName: string | null | undefined): Promise<void> {
    if (await this.hasConnectedDevice()) return;
    const normalisedAvdName = normaliseAvdName(avdName);
    await this.startEmulator(normalisedAvdName);
    await this.waitForDeviceReady();
  }

  private async hasConnectedDevice(): Promise<boolean> {
    try {
      const { stdout } = await this.runAdb(['devices'], 15000);
      return stdout
        .toString()
        .split(/\r?\n/)
        .some((line) => /\tdevice$/.test(line.trim()));
    } catch {
      return false;
    }
  }

  private async startEmulator(avdName: string): Promise<void> {
    const emulatorExecutable = await this.resolveEmulatorExecutable();
    try {
      this.startProcess(emulatorExecutable, ['-avd', avdName]);
    } catch (error: unknown) {
      throw new ApplicationError(
        'EXTERNAL_URL_FAILED',
        'RefTrack could not start the Android emulator. Check Android Studio or your emulator path.',
        { field: 'avdName', recoverable: true, cause: error },
      );
    }
  }

  private async resolveEmulatorExecutable(): Promise<string> {
    if (this.options.emulatorExecutable?.trim()) return this.options.emulatorExecutable.trim();

    const environment = this.options.environment ?? process.env;
    const executableName = process.platform === 'win32' ? 'emulator.exe' : 'emulator';
    const candidateRoots = [
      environment.ANDROID_HOME,
      environment.ANDROID_SDK_ROOT,
      environment.LOCALAPPDATA ? path.join(environment.LOCALAPPDATA, 'Android', 'Sdk') : null,
    ].filter((root): root is string => Boolean(root?.trim()));

    for (const root of candidateRoots) {
      const candidate = path.join(root, 'emulator', executableName);
      if (await fileExists(candidate)) return candidate;
    }

    return 'emulator';
  }

  private async waitForDeviceReady(): Promise<void> {
    await this.runAdb(['wait-for-device']);
    const deadline = Date.now() + (this.options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS);
    let lastError: unknown = null;

    while (Date.now() < deadline) {
      try {
        const { stdout } = await this.runAdb(['shell', 'getprop', 'sys.boot_completed'], 10000);
        if (stdout.toString().trim() === '1') return;
      } catch (error: unknown) {
        lastError = error;
      }
      await this.sleep(BOOT_POLL_INTERVAL_MS);
    }

    throw new ApplicationError(
      'EXTERNAL_URL_FAILED',
      'The Android emulator started, but it did not finish booting in time.',
      { recoverable: true, cause: lastError },
    );
  }

  private async runAdb(
    args: readonly string[],
    timeout = DEFAULT_ADB_TIMEOUT_MS,
  ): Promise<CommandResult> {
    try {
      return await this.runCommand(this.adbExecutable, args, { windowsHide: true, timeout });
    } catch (error: unknown) {
      throw new ApplicationError(
        'EXTERNAL_URL_FAILED',
        'RefTrack could not reach an Android emulator through adb.',
        { recoverable: true, cause: error },
      );
    }
  }

  private get adbExecutable(): string {
    return this.options.adbExecutable ?? 'adb';
  }

  private runCommand(
    file: string,
    args: readonly string[],
    options: { windowsHide: true; timeout: number },
  ) {
    return this.options.runCommand
      ? this.options.runCommand(file, args, options)
      : execFile(file, [...args], options);
  }

  private startProcess(file: string, args: readonly string[]): void {
    if (this.options.startProcess) {
      this.options.startProcess(file, args);
      return;
    }
    const child = spawn(file, [...args], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  }

  private sleep(milliseconds: number): Promise<void> {
    return this.options.sleep
      ? this.options.sleep(milliseconds)
      : new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

export async function readApkPackageName(apkPath: string): Promise<string | null> {
  const apk = await readFile(apkPath);
  const manifest = extractZipEntry(apk, 'AndroidManifest.xml');
  if (!manifest) return null;
  return readBinaryAndroidManifestPackage(manifest);
}

async function assertAccessibleFile(filePath: string, field: string): Promise<void> {
  try {
    await access(filePath);
  } catch (error: unknown) {
    throw new ApplicationError('FOLDER_UNAVAILABLE', 'That APK file is unavailable.', {
      field,
      recoverable: true,
      cause: error,
    });
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalisePackageName(value: string): string {
  const packageName = value.trim();
  if (!ANDROID_PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new ApplicationError('VALIDATION_FAILED', 'Enter a valid Android package name.', {
      field: 'packageName',
      recoverable: true,
    });
  }
  return packageName;
}

function normaliseDeepLink(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (!['https:', 'http:', 'intent:'].includes(url.protocol)) {
      throw new Error('Unsupported deep-link protocol');
    }
    if (url.username || url.password) throw new Error('Credentials are not allowed');
    return trimmed;
  } catch (error: unknown) {
    throw new ApplicationError('VALIDATION_FAILED', 'Enter a valid app or web link.', {
      field: 'deepLinkUrl',
      recoverable: true,
      cause: error,
    });
  }
}

function normaliseAvdName(value: string | null | undefined): string {
  const avdName = (value ?? '').trim();
  if (
    !avdName ||
    avdName.length > 160 ||
    avdName.startsWith('-') ||
    avdName.includes('/') ||
    avdName.includes('\\') ||
    avdName.includes('\0')
  ) {
    throw new ApplicationError('VALIDATION_FAILED', 'Enter an Android emulator AVD name.', {
      field: 'avdName',
      recoverable: true,
    });
  }
  return avdName;
}

function extractZipEntry(zip: Buffer, entryName: string): Buffer | null {
  const endOfCentralDirectory = findEndOfCentralDirectory(zip);
  if (endOfCentralDirectory < 0) return null;

  const entries = zip.readUInt16LE(endOfCentralDirectory + 10);
  let directoryOffset = zip.readUInt32LE(endOfCentralDirectory + 16);
  for (let index = 0; index < entries; index += 1) {
    if (zip.readUInt32LE(directoryOffset) !== 0x02014b50) return null;
    const compressionMethod = zip.readUInt16LE(directoryOffset + 10);
    const compressedSize = zip.readUInt32LE(directoryOffset + 20);
    const fileNameLength = zip.readUInt16LE(directoryOffset + 28);
    const extraLength = zip.readUInt16LE(directoryOffset + 30);
    const commentLength = zip.readUInt16LE(directoryOffset + 32);
    const localHeaderOffset = zip.readUInt32LE(directoryOffset + 42);
    const fileName = zip
      .subarray(directoryOffset + 46, directoryOffset + 46 + fileNameLength)
      .toString('utf8');

    if (fileName === entryName) {
      const localFileNameLength = zip.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return Buffer.from(compressed);
      if (compressionMethod === 8) return inflateRawSync(compressed);
      return null;
    }

    directoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const minimumOffset = Math.max(0, zip.length - 66000);
  for (let offset = zip.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readBinaryAndroidManifestPackage(manifest: Buffer): string | null {
  const xmlHeaderSize = manifest.readUInt16LE(2);
  let offset = xmlHeaderSize;
  let strings: string[] = [];

  while (offset < manifest.length) {
    const chunkType = manifest.readUInt16LE(offset);
    const chunkSize = manifest.readUInt32LE(offset + 4);
    if (chunkType === 0x0001) {
      const pool = readStringPool(manifest, offset);
      strings = pool.strings;
      offset = pool.nextOffset;
      break;
    }
    offset += chunkSize;
  }

  while (offset < manifest.length) {
    const chunkType = manifest.readUInt16LE(offset);
    const chunkSize = manifest.readUInt32LE(offset + 4);
    if (chunkType === 0x0102) {
      const elementName = readString(strings, manifest.readUInt32LE(offset + 20));
      if (elementName === 'manifest') return readPackageAttribute(manifest, strings, offset);
    }
    offset += chunkSize;
  }

  return null;
}

function readStringPool(data: Buffer, offset: number): { strings: string[]; nextOffset: number } {
  const headerSize = data.readUInt16LE(offset + 2);
  const chunkSize = data.readUInt32LE(offset + 4);
  const stringCount = data.readUInt32LE(offset + 8);
  const flags = data.readUInt32LE(offset + 16);
  const stringsStart = data.readUInt32LE(offset + 20);
  const utf8 = Boolean(flags & 0x100);
  const strings: string[] = [];

  for (let index = 0; index < stringCount; index += 1) {
    const stringOffset = data.readUInt32LE(offset + headerSize + index * 4);
    let cursor = offset + stringsStart + stringOffset;
    if (utf8) {
      [, cursor] = readUtf8Length(data, cursor);
      const [byteLength, nextCursor] = readUtf8Length(data, cursor);
      cursor = nextCursor;
      strings.push(data.subarray(cursor, cursor + byteLength).toString('utf8'));
    } else {
      const [characterLength, nextCursor] = readUtf16Length(data, cursor);
      cursor = nextCursor;
      strings.push(data.subarray(cursor, cursor + characterLength * 2).toString('utf16le'));
    }
  }

  return { strings, nextOffset: offset + chunkSize };
}

function readPackageAttribute(
  manifest: Buffer,
  strings: readonly string[],
  offset: number,
): string | null {
  const attrStart = manifest.readUInt16LE(offset + 24);
  const attrSize = manifest.readUInt16LE(offset + 26);
  const attrCount = manifest.readUInt16LE(offset + 28);
  const attrsOffset = offset + 16 + attrStart;

  for (let index = 0; index < attrCount; index += 1) {
    const attrOffset = attrsOffset + index * attrSize;
    const name = readString(strings, manifest.readUInt32LE(attrOffset + 4));
    if (name !== 'package') continue;
    const rawValueIndex = manifest.readUInt32LE(attrOffset + 8);
    const rawValue = readString(strings, rawValueIndex);
    return rawValue && ANDROID_PACKAGE_NAME_PATTERN.test(rawValue) ? rawValue : null;
  }

  return null;
}

function readString(strings: readonly string[], index: number): string | null {
  if (index === 0xffffffff) return null;
  return strings[index] ?? null;
}

function readUtf8Length(data: Buffer, offset: number): [number, number] {
  const first = data[offset] ?? 0;
  if (first & 0x80) return [((first & 0x7f) << 8) | (data[offset + 1] ?? 0), offset + 2];
  return [first, offset + 1];
}

function readUtf16Length(data: Buffer, offset: number): [number, number] {
  const first = data.readUInt16LE(offset);
  if (first & 0x8000) {
    return [((first & 0x7fff) << 16) | data.readUInt16LE(offset + 2), offset + 4];
  }
  return [first, offset + 2];
}
