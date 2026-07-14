import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultAppState } from '../../src/domain/defaults';
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

  it('loads legacy state without hotkey settings by applying the default', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'reftrack-service-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'state.json');

    const legacy = createDefaultAppState() as Record<string, unknown>;
    const settings = { ...(legacy.settings as Record<string, unknown>) };
    delete settings.hotkeys;
    legacy.settings = settings;
    await writeFile(filePath, JSON.stringify(legacy, null, 2), 'utf8');

    const { service, initialisation } = await StateService.create({ filePath });

    expect(initialisation.source).toBe('primary');
    expect(initialisation.recovered).toBe(false);
    expect(service.getSnapshot().settings.hotkeys).toEqual({ enabled: true, bindings: [] });
  });

  it('loads legacy check-in settings without schedule fields', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'reftrack-service-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'state.json');

    const legacy = createDefaultAppState() as Record<string, unknown>;
    const settings = { ...(legacy.settings as Record<string, unknown>) };
    const checkin = { ...(settings.checkin as Record<string, unknown>) };
    delete checkin.scheduleEnabled;
    delete checkin.scheduleTime;
    delete checkin.lastScheduledRunDate;
    settings.checkin = checkin;
    legacy.settings = settings;
    await writeFile(filePath, JSON.stringify(legacy, null, 2), 'utf8');

    const { service, initialisation } = await StateService.create({ filePath });

    expect(initialisation.recovered).toBe(false);
    expect(service.getSnapshot().settings.checkin).toMatchObject({
      scheduleEnabled: false,
      scheduleTime: '09:00',
      lastScheduledRunDate: null,
    });
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
