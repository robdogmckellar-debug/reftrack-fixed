import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export type StateLoadSource = 'primary' | 'backup' | 'default';

export interface StateLoadResult<T> {
  state: T;
  source: StateLoadSource;
  recovered: boolean;
}

export interface AtomicJsonStoreOptions<T> {
  filePath: string;
  parse(value: unknown): T;
  createDefault(): T;
  now?: () => Date;
}

interface ValidatedFile<T> {
  exists: boolean;
  state: T | null;
  error: unknown | null;
}

export class AtomicJsonStore<T> {
  readonly filePath: string;
  readonly backupPath: string;

  private readonly parse: (value: unknown) => T;
  private readonly createDefault: () => T;
  private readonly now: () => Date;

  constructor(options: AtomicJsonStoreOptions<T>) {
    this.filePath = options.filePath;
    this.backupPath = `${options.filePath}.backup`;
    this.parse = options.parse;
    this.createDefault = options.createDefault;
    this.now = options.now ?? (() => new Date());
  }

  async load(): Promise<StateLoadResult<T>> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const primary = await this.readValidated(this.filePath);
    if (primary.state !== null) {
      return { state: primary.state, source: 'primary', recovered: false };
    }

    const backup = await this.readValidated(this.backupPath);
    if (backup.state !== null) {
      if (primary.exists) await this.archiveCorruptFile(this.filePath);
      await this.writeAtomic(this.filePath, backup.state);
      return { state: backup.state, source: 'backup', recovered: true };
    }

    if (primary.exists) await this.archiveCorruptFile(this.filePath);
    if (backup.exists) await this.archiveCorruptFile(this.backupPath);

    const state = this.parse(this.createDefault());
    await this.writeAtomic(this.filePath, state);
    await this.writeAtomic(this.backupPath, state);
    return {
      state,
      source: 'default',
      recovered: primary.exists || backup.exists,
    };
  }

  async save(nextState: T, previousState: T): Promise<void> {
    const validatedNext = this.parse(nextState);
    const validatedPrevious = this.parse(previousState);

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await this.writeAtomic(this.backupPath, validatedPrevious);
    await this.writeAtomic(this.filePath, validatedNext);
  }

  private async readValidated(filePath: string): Promise<ValidatedFile<T>> {
    try {
      const raw = await readFile(filePath, 'utf8');
      return {
        exists: true,
        state: this.parse(JSON.parse(raw) as unknown),
        error: null,
      };
    } catch (error: unknown) {
      const exists = await this.exists(filePath);
      return { exists, state: null, error };
    }
  }

  private async writeAtomic(filePath: string, value: T): Promise<void> {
    const directory = path.dirname(filePath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const serialized = `${JSON.stringify(value, null, 2)}\n`;

    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;

      await rename(temporaryPath, filePath);
      await this.syncDirectory(directory);
    } catch (error: unknown) {
      if (handle) await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async archiveCorruptFile(filePath: string): Promise<void> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const archivePath = `${filePath}.corrupt-${stamp}`;
    await rename(filePath, archivePath).catch(() => undefined);
  }

  private async syncDirectory(directory: string): Promise<void> {
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(directory, 'r');
      await handle.sync();
    } catch {
      // Directory fsync is not supported consistently on Windows. The file
      // itself is already flushed; this remains a best-effort durability step.
    } finally {
      if (handle) await handle.close().catch(() => undefined);
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
