import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { StateService } from '../../src/main/services/state-service';

const temporaryDirectories: string[] = [];

async function createService(): Promise<StateService> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reftrack-service-'));
  temporaryDirectories.push(directory);
  return (
    await StateService.create({
      filePath: path.join(directory, 'state.json'),
    })
  ).service;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('serial state service', () => {
  it('serialises concurrent mutations and increments revisions without lost updates', async () => {
    const service = await createService();

    await Promise.all([
      service.update((state) => {
        state.dailyRecords['2026-06-30'] = {
          u2win: { copies: 1, successes: 0, earningsCents: 0 },
        };
      }),
      service.update((state) => {
        const metrics = state.dailyRecords['2026-06-30']?.u2win;
        if (!metrics) throw new Error('First queued mutation was not visible');
        metrics.successes += 1;
        metrics.earningsCents += 3000;
      }),
    ]);

    const snapshot = service.getSnapshot();
    expect(snapshot.revision).toBe(2);
    expect(snapshot.dailyRecords['2026-06-30']?.u2win).toEqual({
      copies: 1,
      successes: 1,
      earningsCents: 3000,
    });
  });

  it('does not expose mutable references to canonical state', async () => {
    const service = await createService();
    const snapshot = service.getSnapshot();
    snapshot.sites[0]!.name = 'MUTATED';

    expect(service.getSnapshot().sites[0]!.name).toBe('U2WIN');
  });

  it('keeps the current state unchanged when validation rejects a replacement', async () => {
    const service = await createService();
    const invalid = service.getSnapshot();
    invalid.sites.push({ ...invalid.sites[0]! });

    await expect(service.replace(invalid)).rejects.toThrow(/Duplicate site ID/);
    expect(service.getSnapshot().revision).toBe(0);
    expect(service.getSnapshot().sites).toHaveLength(9);
  });
});
