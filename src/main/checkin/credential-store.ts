import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { ApplicationError } from '../services/application-error';

export interface CredentialSecrets {
  username: string;
  password: string;
}

/**
 * Minimal encryption surface used by the credential store. In production this is
 * backed by Electron's OS-level {@link safeStorage}; tests inject a fake.
 */
export interface CredentialCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface CredentialFileShape {
  version: 1;
  entries: Record<string, string>;
}

const MAX_FIELD_LENGTH = 4096;

/**
 * Persists per-task-site login credentials encrypted at rest. Passwords are
 * never written in plaintext and never returned to the renderer; only the main
 * process check-in runner reads them back.
 */
export class CredentialStore {
  private entries = new Map<string, string>();
  private loaded = false;

  constructor(
    private readonly filePath: string,
    private readonly crypto: CredentialCrypto,
  ) {}

  async has(taskSiteId: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.entries.has(taskSiteId);
  }

  async listIds(): Promise<string[]> {
    await this.ensureLoaded();
    return [...this.entries.keys()];
  }

  async get(taskSiteId: string): Promise<CredentialSecrets | null> {
    await this.ensureLoaded();
    const encoded = this.entries.get(taskSiteId);
    if (!encoded) return null;

    try {
      const decrypted = this.crypto.decryptString(Buffer.from(encoded, 'base64'));
      const parsed = JSON.parse(decrypted) as Partial<CredentialSecrets>;
      if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') {
        return null;
      }
      return { username: parsed.username, password: parsed.password };
    } catch {
      return null;
    }
  }

  async set(taskSiteId: string, secrets: CredentialSecrets): Promise<void> {
    this.assertEncryptionAvailable();
    if (secrets.username.length > MAX_FIELD_LENGTH || secrets.password.length > MAX_FIELD_LENGTH) {
      throw new ApplicationError('VALIDATION_FAILED', 'The supplied credentials are too long.', {
        recoverable: true,
      });
    }

    await this.ensureLoaded();
    const encrypted = this.crypto.encryptString(
      JSON.stringify({ username: secrets.username, password: secrets.password }),
    );
    this.entries.set(taskSiteId, encrypted.toString('base64'));
    await this.persist();
  }

  async delete(taskSiteId: string): Promise<boolean> {
    await this.ensureLoaded();
    const existed = this.entries.delete(taskSiteId);
    if (existed) await this.persist();
    return existed;
  }

  /** Removes any stored credentials whose task-site id is not in `keepIds`. */
  async pruneExcept(keepIds: Iterable<string>): Promise<void> {
    await this.ensureLoaded();
    const keep = new Set(keepIds);
    let changed = false;
    for (const id of [...this.entries.keys()]) {
      if (!keep.has(id)) {
        this.entries.delete(id);
        changed = true;
      }
    }
    if (changed) await this.persist();
  }

  private assertEncryptionAvailable(): void {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new ApplicationError(
        'CHECKIN_ENCRYPTION_UNAVAILABLE',
        'Secure credential storage is not available on this device.',
        { recoverable: false },
      );
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<CredentialFileShape>;
      if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        for (const [id, value] of Object.entries(parsed.entries)) {
          if (typeof value === 'string') this.entries.set(id, value);
        }
      }
    } catch {
      // Corrupt credential file: start empty rather than crash the app.
      this.entries.clear();
    }
  }

  private async persist(): Promise<void> {
    const payload: CredentialFileShape = {
      version: 1,
      entries: Object.fromEntries(this.entries),
    };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, this.filePath);
  }
}
