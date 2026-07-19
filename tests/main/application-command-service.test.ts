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

  it('archives and recycles a site without removing metrics, then blocks active actions', async () => {
    const { commands, state } = await createCommands();
    await commands.recordSuccess('galaxy', '2026-06-30T09:05:00.000Z');

    await commands.setSiteLifecycle({
      siteId: 'galaxy',
      lifecycle: 'archived',
      occurredAt: '2026-06-30T10:00:00.000Z',
    });

    let snapshot = state.getSnapshot();
    expect(snapshot.sites.find((site) => site.id === 'galaxy')).toMatchObject({
      lifecycle: 'archived',
      lifecycleChangedAt: '2026-06-30T10:00:00.000Z',
    });
    expect(snapshot.dailyRecords['2026-06-30']?.galaxy?.earningsCents).toBe(3000);
    await expect(
      commands.recordSuccess('galaxy', '2026-06-30T10:05:00.000Z'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await commands.setSiteLifecycle({
      siteId: 'galaxy',
      lifecycle: 'trashed',
      occurredAt: '2026-06-30T10:10:00.000Z',
    });
    snapshot = state.getSnapshot();
    expect(snapshot.sites.find((site) => site.id === 'galaxy')?.lifecycle).toBe('trashed');
    expect(snapshot.dailyRecords['2026-06-30']?.galaxy?.earningsCents).toBe(3000);
  });

  it('records, receives, and removes payout ledger entries without mutating earnings', async () => {
    const { commands, state } = await createCommands();
    await commands.recordSuccess('galaxy', '2026-06-30T09:05:00.000Z');

    const created = await commands.upsertPayout({
      id: null,
      siteId: 'galaxy',
      amountCents: 3000,
      expectedDate: '2026-07-15',
      paidAt: null,
      occurredAt: '2026-07-01T10:00:00.000Z',
      note: 'Monthly payout',
    });
    expect(state.getSnapshot().payouts?.[0]).toMatchObject({
      id: created.payoutId,
      amountCents: 3000,
      paidAt: null,
    });

    await commands.upsertPayout({
      id: created.payoutId,
      siteId: 'galaxy',
      amountCents: 3000,
      expectedDate: '2026-07-15',
      paidAt: '2026-07-16T10:00:00.000Z',
      occurredAt: '2026-07-16T10:00:00.000Z',
      note: 'Monthly payout',
    });
    expect(state.getSnapshot().payouts?.[0]?.paidAt).toBe('2026-07-16T10:00:00.000Z');
    expect(state.getSnapshot().dailyRecords['2026-06-30']?.galaxy?.earningsCents).toBe(3000);

    await commands.deletePayout(created.payoutId);
    expect(state.getSnapshot().payouts).toEqual([]);
    expect(state.getSnapshot().dailyRecords['2026-06-30']?.galaxy?.earningsCents).toBe(3000);
  });

  it('saves, normalises, and deletes Facebook group share destinations', async () => {
    const { commands, state } = await createCommands();

    const created = await commands.upsertFacebookGroupShare({
      id: null,
      label: 'VIP Group',
      groupUrl: 'http://facebook.com/groups/vip-referrals?sorting_setting=CHRONOLOGICAL',
      currentPostUrl: 'http://facebook.com/groups/vip-referrals/posts/123',
      useMostRecentPost: true,
    });

    expect(state.getSnapshot().settings.facebookGroupShares.groups[0]).toEqual({
      id: created.groupId,
      label: 'VIP Group',
      groupUrl: 'https://www.facebook.com/groups/vip-referrals/',
      currentPostUrl: 'https://www.facebook.com/groups/vip-referrals/posts/123',
      useMostRecentPost: true,
    });

    await expect(
      commands.upsertFacebookGroupShare({
        id: null,
        label: 'Bad Group',
        groupUrl: 'https://example.com/groups/nope',
        currentPostUrl: null,
        useMostRecentPost: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await commands.deleteFacebookGroupShare(created.groupId);
    expect(state.getSnapshot().settings.facebookGroupShares.groups).toEqual([]);
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

  it('adds shared sites to existing and new categories in one transaction', async () => {
    const { commands, state } = await createCommands();
    await commands.upsertTaskCategory({
      id: 'category-a',
      name: 'Category A',
      colour: 'teal',
      sites: [{ id: 'site-a', name: 'A', url: 'https://a.example' }],
    });

    const response = await commands.addTaskSitesToCategories({
      sites: [{ id: 'site-a', name: 'A', url: 'https://a.example' }],
      categoryIds: ['category-a'],
      newCategory: { id: 'category-b', name: 'Category B', colour: 'purple' },
    });

    expect(response.categoryIds).toEqual(['category-a', 'category-b']);
    expect(state.getSnapshot().taskCategories).toMatchObject([
      { id: 'category-a', sites: [{ id: 'site-a' }] },
      { id: 'category-b', sites: [{ id: 'site-a' }] },
    ]);
  });

  it('synchronises shared site edits and completion across category memberships', async () => {
    const { commands, state } = await createCommands();
    await commands.upsertTaskCategory({
      id: 'category-a',
      name: 'Category A',
      colour: 'teal',
      sites: [{ id: 'site-a', name: 'A', url: 'https://a.example' }],
    });
    await commands.addTaskSitesToCategories({
      sites: [{ id: 'site-a', name: 'A', url: 'https://a.example' }],
      categoryIds: [],
      newCategory: { id: 'category-b', name: 'Category B', colour: 'purple' },
    });

    await commands.upsertTaskCategory({
      id: 'category-a',
      name: 'Category A',
      colour: 'teal',
      sites: [{ id: 'site-a', name: 'Updated A', url: 'https://a.example/new' }],
    });
    await commands.setTaskCompletion('2026-06-30', {
      categoryId: 'category-a',
      siteId: 'site-a',
      done: true,
    });

    const snapshot = state.getSnapshot();
    expect(snapshot.taskCategories[1]?.sites[0]).toMatchObject({
      id: 'site-a',
      name: 'Updated A',
      url: 'https://a.example/new',
    });
    expect(snapshot.taskDailyRecords['2026-06-30']).toEqual({
      'category-a': { 'site-a': true },
      'category-b': { 'site-a': true },
    });
  });
});
