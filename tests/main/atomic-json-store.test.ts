import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultAppState } from '../../src/domain/defaults';
import { AtomicJsonStore } from '../../src/main/persistence/atomic-json-store';
import { parseAppState } from '../../src/main/persistence/state-schema';

const temporaryDirectories: string[] = [];

async function createStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reftrack-store-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'state.json');
  return {
    directory,
    filePath,
    store: new AtomicJsonStore({
      filePath,
      parse: parseAppState,
      createDefault: createDefaultAppState,
      now: () => new Date('2026-06-30T00:00:00.000Z'),
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('atomic JSON storage', () => {
  it('creates and validates a default primary and backup state', async () => {
    const { filePath, store } = await createStore();
    const loaded = await store.load();

    expect(loaded.source).toBe('default');
    expect(loaded.recovered).toBe(false);
    expect(parseAppState(JSON.parse(await readFile(filePath, 'utf8')) as unknown)).toEqual(
      loaded.state,
    );
    expect(parseAppState(JSON.parse(await readFile(store.backupPath, 'utf8')) as unknown)).toEqual(
      loaded.state,
    );
  });

  it('recovers a corrupted primary from the last known-good backup', async () => {
    const { directory, filePath, store } = await createStore();
    const initial = (await store.load()).state;
    const next = structuredClone(initial);
    next.revision = 1;
    next.settings.darkMode = false;
    await store.save(next, initial);

    await writeFile(filePath, '{broken', 'utf8');
    const recovered = await store.load();

    expect(recovered.source).toBe('backup');
    expect(recovered.recovered).toBe(true);
    expect(recovered.state).toEqual(initial);
    expect((await readdir(directory)).some((name) => name.includes('.corrupt-'))).toBe(true);
  });

  it('leaves no temporary files after a successful commit', async () => {
    const { directory, store } = await createStore();
    const initial = (await store.load()).state;
    const next = structuredClone(initial);
    next.revision = 1;
    next.settings.darkMode = false;

    await store.save(next, initial);

    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
