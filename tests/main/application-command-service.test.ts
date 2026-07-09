import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ApplicationCommandService } from '../../src/main/services/application-command-service';
import { ApplicationError } from '../../src/main/services/application-error';
import { StateService } from '../../src/main/services/state-service';

const temporaryDirectories: string[] = [];

async function createCommands(): Promise<{
  commands: ApplicationCommandService;
  state: StateService;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reftrack-commands-'));
  temporaryDirectories.push(directory);
  const state = (
    await StateService.create({
      filePath: path.join(directory, 'state.json'),
    })
  ).service;
  return { commands: new ApplicationCommandService(state), state };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('typed application commands', () => {
  it('serialises copy commands and rejects a duplicate past the daily limit', async () => {
    const { commands, state } = await createCommands();
    const occurredAt = '2026-06-30T10:00:00.000Z';

    const results = await Promise.allSettled([
      commands.recordCopy('galaxy', occurredAt),
      commands.recordCopy('galaxy', occurredAt),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(ApplicationError);
      expect((rejected.reason as ApplicationError).code).toBe('DAILY_LIMIT_REACHED');
    }
    expect(state.getSnapshot().dailyRecords['2026-06-30']?.galaxy?.copies).toBe(1);
  });

  it('undoes the exact success transaction without removing unrelated activity', async () => {
    const { commands, state } = await createCommands();

    await commands.recordCopy('u2win', '2026-06-30T09:00:00.000Z');
    const success = await commands.recordSuccess('u2win', '2026-06-30T09:05:00.000Z');
    await commands.recordCopy('u2win', '2026-06-30T09:10:00.000Z');
    await commands.undoSuccess(success.activityId);

    const snapshot = state.getSnapshot();
    expect(snapshot.dailyRecords['2026-06-30']?.u2win).toEqual({
      copies: 2,
      successes: 0,
      earningsCents: 0,
    });
    expect(snapshot.activity.map((entry) => entry.type)).toEqual(['copy', 'copy']);
  });

  it('deletes a site and its historical metrics through a narrow command', async () => {
    const { commands, state } = await createCommands();
    await commands.recordSuccess('galaxy', '2026-06-30T09:05:00.000Z');

    await commands.deleteSite('galaxy', '2026-06-30T10:00:00.000Z');

    const snapshot = state.getSnapshot();
    expect(snapshot.sites.some((site) => site.id === 'galaxy')).toBe(false);
    expect(snapshot.dailyRecords['2026-06-30']?.galaxy).toBeUndefined();
    expect(snapshot.activity).toHaveLength(1);
    expect(snapshot.activity[0]).toMatchObject({ type: 'delete', siteName: 'GALAXY' });
  });

  it('preserves task completion only for stable task-site IDs after category edits', async () => {
    const { commands, state } = await createCommands();
    await commands.upsertTaskCategory({
      id: 'category-a',
      name: 'Category A',
      colour: 'teal',
      sites: [
        { id: 'site-a', name: 'A', url: 'https://a.example' },
        { id: 'site-b', name: 'B', url: 'https://b.example' },
      ],
    });
    await commands.setTaskCompletion('2026-06-30', {
      categoryId: 'category-a',
      siteId: 'site-a',
      done: true,
    });

    await commands.upsertTaskCategory({
      id: 'category-a',
      name: 'Category A',
      colour: 'purple',
      sites: [{ id: 'site-b', name: 'B', url: 'https://b.example' }],
    });

    expect(state.getSnapshot().taskDailyRecords['2026-06-30']).toEqual({
      'category-a': {},
    });
  });

  it('marks the owning Daily Task complete when a check-in succeeds', async () => {
    const { commands, state } = await createCommands();
    await commands.upsertTaskCategory({
      id: 'category-a',
      name: 'Category A',
      colour: 'teal',
      sites: [
        { id: 'site-a', name: 'A', url: 'https://a.example', checkin: { enabled: true } },
        { id: 'site-b', name: 'B', url: 'https://b.example', checkin: { enabled: true } },
      ],
    });

    await commands.recordCheckinResult('2026-06-30', 'site-a', {
      status: 'success',
      at: '2026-06-30T00:10:00.000Z',
    });

    const snapshot = state.getSnapshot();
    expect(snapshot.checkinDailyRecords['2026-06-30']?.['site-a']?.status).toBe('success');
    expect(snapshot.taskDailyRecords['2026-06-30']?.['category-a']?.['site-a']).toBe(true);
    expect(snapshot.taskDailyRecords['2026-06-30']?.['category-a']?.['site-b']).toBeUndefined();
  });

  it('does not complete the Daily Task when a check-in fails or is skipped', async () => {
    const { commands, state } = await createCommands();
    await commands.upsertTaskCategory({
      id: 'category-a',
      name: 'Category A',
      colour: 'teal',
      sites: [{ id: 'site-a', name: 'A', url: 'https://a.example', checkin: { enabled: true } }],
    });

    await commands.recordCheckinResult('2026-06-30', 'site-a', {
      status: 'failed',
      at: '2026-06-30T00:10:00.000Z',
    });
    await commands.recordCheckinResult('2026-06-30', 'site-a', {
      status: 'skipped',
      at: '2026-06-30T00:10:00.000Z',
    });

    expect(
      state.getSnapshot().taskDailyRecords['2026-06-30']?.['category-a']?.['site-a'],
    ).toBeUndefined();
  });
});
