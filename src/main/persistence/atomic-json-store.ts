import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export type StateLoadSource = 'primary' | 'backup' | 'default';

export interface StateLoadResult<T> {
  state: T;
  source: StateLoadSource;
  recovered: boolean;
  archivedPath: string | null;
}

export interface AtomicJsonStoreOptions<T> {
  filePath: string;
  parse(value: unknown): T;
  createDefault(): T;
  /** Upgrade a parsed-but-unvalidated document before strict validation. */
  migrate?(value: unknown): unknown;
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
  private readonly migrate: ((value: unknown) => unknown) | undefined;
  private readonly now: () => Date;

  constructor(options: AtomicJsonStoreOptions<T>) {
    this.filePath = options.filePath;
    this.backupPath = `${options.filePath}.backup`;
    this.parse = options.parse;
    this.createDefault = options.createDefault;
    this.migrate = options.migrate;
    this.now = options.now ?? (() => new Date());
  }

  async load(): Promise<StateLoadResult<T>> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const primary = await this.readValidated(this.filePath);
    if (primary.state !== null) {
      return { state: primary.state, source: 'primary', recovered: false, archivedPath: null };
    }

    const backup = await this.readValidated(this.backupPath);
    if (backup.state !== null) {
      const archivedPath = primary.exists ? await this.archiveCorruptFile(this.filePath) : null;
      await this.writeAtomic(this.filePath, backup.state);
      return { state: backup.state, source: 'backup', recovered: true, archivedPath };
    }

    const archivedPrimary = primary.exists ? await this.archiveCorruptFile(this.filePath) : null;
    const archivedBackup = backup.exists ? await this.archiveCorruptFile(this.backupPath) : null;

    const state = this.parse(this.createDefault());
    await this.writeAtomic(this.filePath, state);
    await this.writeAtomic(this.backupPath, state);
    return {
      state,
      source: 'default',
      recovered: primary.exists || backup.exists,
      archivedPath: archivedPrimary ?? archivedBackup,
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
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error: unknown) {
      return { exists: await this.exists(filePath), state: null, error };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error: unknown) {
      return { exists: true, state: null, error };
    }

    // Migration failures (e.g. a newer schema version than this build supports)
    // intentionally propagate: load() must not treat future-version data as
    // corruption and overwrite it.
    const migrated = this.migrate ? this.migrate(parsedJson) : parsedJson;

    try {
      return { exists: true, state: this.parse(migrated), error: null };
    } catch (error: unknown) {
      return { exists: true, state: null, error };
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

  private async archiveCorruptFile(filePath: string): Promise<string | null> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const archivePath = `${filePath}.corrupt-${stamp}`;
    try {
      await rename(filePath, archivePath);
      return archivePath;
    } catch {
      return null;
    }
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
