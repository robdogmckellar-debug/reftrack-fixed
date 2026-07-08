import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CredentialStore } from '../../src/main/checkin/credential-store';
import type { CredentialCrypto } from '../../src/main/checkin/credential-store';

const PREFIX = 'enc::';

function reversibleCrypto(available = true): CredentialCrypto {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText) => Buffer.from(`${PREFIX}${plainText}`, 'utf8'),
    decryptString: (encrypted) => encrypted.toString('utf8').slice(PREFIX.length),
  };
}

let directory: string;
let filePath: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'reftrack-creds-'));
  filePath = path.join(directory, 'creds.bin');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('CredentialStore', () => {
  it('encrypts credentials at rest and reads them back', async () => {
    const store = new CredentialStore(filePath, reversibleCrypto());
    await store.set('site-a', { username: 'alice', password: 's3cret' });

    expect(await store.has('site-a')).toBe(true);
    expect(await store.get('site-a')).toEqual({ username: 'alice', password: 's3cret' });

    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain('s3cret');
    const stored = (JSON.parse(raw) as { entries: Record<string, string> }).entries['site-a'];
    expect(Buffer.from(stored ?? '', 'base64').toString('utf8')).toContain(PREFIX);
  });

  it('persists across instances and lists stored ids', async () => {
    const store = new CredentialStore(filePath, reversibleCrypto());
    await store.set('site-a', { username: 'alice', password: 'a' });
    await store.set('site-b', { username: 'bob', password: 'b' });

    const reopened = new CredentialStore(filePath, reversibleCrypto());
    expect((await reopened.listIds()).sort()).toEqual(['site-a', 'site-b']);
    expect(await reopened.get('site-b')).toEqual({ username: 'bob', password: 'b' });
  });

  it('deletes individual credentials and prunes orphans', async () => {
    const store = new CredentialStore(filePath, reversibleCrypto());
    await store.set('site-a', { username: 'a', password: 'a' });
    await store.set('site-b', { username: 'b', password: 'b' });
    await store.set('site-c', { username: 'c', password: 'c' });

    expect(await store.delete('site-a')).toBe(true);
    expect(await store.delete('site-a')).toBe(false);

    await store.pruneExcept(['site-b']);
    expect((await store.listIds()).sort()).toEqual(['site-b']);
  });

  it('returns null for unknown sites', async () => {
    const store = new CredentialStore(filePath, reversibleCrypto());
    expect(await store.get('missing')).toBeNull();
    expect(await store.has('missing')).toBe(false);
  });

  it('refuses to store credentials when encryption is unavailable', async () => {
    const store = new CredentialStore(filePath, reversibleCrypto(false));
    await expect(store.set('site-a', { username: 'a', password: 'a' })).rejects.toMatchObject({
      code: 'CHECKIN_ENCRYPTION_UNAVAILABLE',
    });
  });

  it('recovers from a corrupt credential file instead of crashing', async () => {
    await writeFile(filePath, 'not-json{', 'utf8');
    const store = new CredentialStore(filePath, reversibleCrypto());
    expect(await store.listIds()).toEqual([]);
    await store.set('site-a', { username: 'a', password: 'a' });
    expect(await store.get('site-a')).toEqual({ username: 'a', password: 'a' });
  });
});
