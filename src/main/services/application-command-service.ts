import { randomUUID } from 'node:crypto';

import type { AppStateV1 } from '../../domain/app-state';
import type { DailySiteMetrics } from '../../domain/entities/daily-metrics';
import type { Site } from '../../domain/entities/site';
import type { PayoutEntry } from '../../domain/entities/payout';
import type {
  CheckinResultRecord,
  TaskCategory,
  TaskSite,
} from '../../domain/entities/task-category';
import type {
  AddTaskSitesToCategoriesRequest,
  AddTaskSitesToCategoriesResponse,
  BootstrapResponse,
  FacebookGroupShareUpsertRequest,
  FacebookGroupShareUpsertResponse,
  PayoutUpsertRequest,
  PayoutUpsertResponse,
  RecordSuccessResponse,
  SetCheckinScheduleRequest,
  SetHotkeysRequest,
  SiteLifecycleRequest,
  SiteUpsertRequest,
  SiteUpsertResponse,
  SnapshotResponse,
  TaskCategoryUpsertResponse,
  TaskCompletionItem,
} from '../../shared/ipc/contract';
import type { RendererSnapshot } from '../../shared/view-model/renderer-snapshot';
import { toRendererSnapshot } from '../view-model/renderer-snapshot-adapter';
import type { StateService } from './state-service';
import { ApplicationError } from './application-error';

export class ApplicationCommandService {
  constructor(private readonly stateService: StateService) {}

  bootstrap(): BootstrapResponse {
    return {
      snapshot: this.getRendererSnapshot(),
      storage: this.stateService.getStorageStatus(),
    };
  }

  async upsertSite(request: SiteUpsertRequest): Promise<SiteUpsertResponse> {
    const siteId = request.id ?? `site_${randomUUID()}`;

    const state = await this.stateService.update((draft) => {
      const existing =
        request.id === null
          ? null
          : (draft.sites.find((candidate) => candidate.id === request.id) ?? null);
      const site: Site = {
        id: siteId,
        name: request.name,
        url: request.url,
        prefix: request.prefix,
        suffix: request.suffix,
        dateFormat: request.dateFormat,
        bonusCents: request.bonusCents,
        maxCopiesPerDay: request.maxCopiesPerDay,
        notes: request.notes,
        lifecycle: existing?.lifecycle ?? 'active',
        lifecycleChangedAt: existing?.lifecycleChangedAt ?? null,
        payoutThresholdCents: request.payoutThresholdCents,
        appClaim: {
          enabled: request.appClaim.enabled,
          downloadUrl: request.appClaim.downloadUrl,
          apkPath: request.appClaim.apkPath,
          packageName: request.appClaim.packageName,
          deepLinkUrl: request.appClaim.deepLinkUrl,
          avdName: request.appClaim.avdName,
        },
      };

      if (request.id === null) {
        draft.sites.push(site);
        return;
      }

      const index = draft.sites.findIndex((candidate) => candidate.id === request.id);
      if (index < 0) {
        throw new ApplicationError('NOT_FOUND', 'The site no longer exists.', {
          field: 'id',
          recoverable: true,
        });
      }
      draft.sites[index] = site;
    });

    return { siteId, snapshot: toRendererSnapshot(state) };
  }

  async setSiteLifecycle(request: SiteLifecycleRequest): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const site = draft.sites.find((candidate) => candidate.id === request.siteId);
      if (!site) {
        throw new ApplicationError('NOT_FOUND', 'The site no longer exists.', {
          field: 'siteId',
          recoverable: true,
        });
      }

      site.lifecycle = request.lifecycle;
      site.lifecycleChangedAt = request.occurredAt;
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  async deleteSite(siteId: string, occurredAt: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const site = draft.sites.find((candidate) => candidate.id === siteId);
      if (!site) {
        throw new ApplicationError('NOT_FOUND', 'The site no longer exists.', {
          field: 'siteId',
          recoverable: true,
        });
      }

      draft.sites = draft.sites.filter((candidate) => candidate.id !== siteId);
      for (const [date, dailyRecord] of Object.entries(draft.dailyRecords)) {
        delete dailyRecord[siteId];
        if (Object.keys(dailyRecord).length === 0) delete draft.dailyRecords[date];
      }
      draft.activity = draft.activity.filter((entry) => entry.siteId !== siteId);
      draft.payouts = (draft.payouts ?? []).filter((payout) => payout.siteId !== siteId);
      draft.activity.unshift({
        id: `activity_${randomUUID()}`,
        occurredAt,
        type: 'delete',
        siteId: null,
        siteName: site.name,
        amountCents: null,
      });
      draft.activity = draft.activity.slice(0, 500);
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  async upsertPayout(request: PayoutUpsertRequest): Promise<PayoutUpsertResponse> {
    const payoutId = request.id ?? `payout_${randomUUID()}`;
    const state = await this.stateService.update((draft) => {
      const site = draft.sites.find((candidate) => candidate.id === request.siteId);
      if (!site) {
        throw new ApplicationError('NOT_FOUND', 'The payout site is unavailable.', {
          field: 'siteId',
          recoverable: true,
        });
      }

      const payouts = (draft.payouts ??= []);
      const existing =
        request.id === null ? null : payouts.find((payout) => payout.id === request.id);
      if (request.id !== null && !existing) {
        throw new ApplicationError('NOT_FOUND', 'The payout entry no longer exists.', {
          field: 'id',
          recoverable: true,
        });
      }

      const payout: PayoutEntry = {
        id: payoutId,
        siteId: request.siteId,
        amountCents: request.amountCents,
        expectedDate: request.expectedDate,
        paidAt: request.paidAt,
        createdAt: existing?.createdAt ?? request.occurredAt,
        note: request.note,
      };
      if (existing) payouts[payouts.indexOf(existing)] = payout;
      else payouts.push(payout);
    });

    return { payoutId, snapshot: toRendererSnapshot(state) };
  }

  async deletePayout(payoutId: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const payouts = (draft.payouts ??= []);
      const index = payouts.findIndex((payout) => payout.id === payoutId);
      if (index < 0) {
        throw new ApplicationError('NOT_FOUND', 'The payout entry no longer exists.', {
          field: 'payoutId',
          recoverable: true,
        });
      }
      payouts.splice(index, 1);
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async clearActivity(): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.activity = [];
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  assertCopyAllowed(siteId: string, occurredAt: string): void {
    const state = this.stateService.getSnapshot();
    const site = requireSite(state, siteId);
    const date = localDateKey(occurredAt);
    const copies = state.dailyRecords[date]?.[siteId]?.copies ?? 0;

    if (site.maxCopiesPerDay > 0 && copies >= site.maxCopiesPerDay) {
      throw new ApplicationError('DAILY_LIMIT_REACHED', `${site.name} is already complete today.`, {
        field: 'siteId',
        recoverable: true,
      });
    }
  }

  async recordCopy(siteId: string, occurredAt: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const site = requireSite(draft, siteId);
      const date = localDateKey(occurredAt);
      const metrics = getOrCreateMetrics(draft, date, siteId);
      const maximum = site.maxCopiesPerDay;

      if (maximum > 0 && metrics.copies >= maximum) {
        throw new ApplicationError(
          'DAILY_LIMIT_REACHED',
          `${site.name} is already complete today.`,
          {
            field: 'siteId',
            recoverable: true,
          },
        );
      }

      metrics.copies += 1;
      draft.activity.unshift({
        id: `activity_${randomUUID()}`,
        occurredAt,
        type: 'copy',
        siteId,
        siteName: site.name,
        amountCents: null,
      });
      draft.activity = draft.activity.slice(0, 500);
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  async recordSuccess(siteId: string, occurredAt: string): Promise<RecordSuccessResponse> {
    const activityId = `activity_${randomUUID()}`;
    let bonusCents = 0;

    const state = await this.stateService.update((draft) => {
      const site = requireSite(draft, siteId);
      const date = localDateKey(occurredAt);
      const metrics = getOrCreateMetrics(draft, date, siteId);
      bonusCents = site.bonusCents;

      metrics.successes += 1;
      metrics.earningsCents += site.bonusCents;
      draft.activity.unshift({
        id: activityId,
        occurredAt,
        type: 'success',
        siteId,
        siteName: site.name,
        amountCents: site.bonusCents,
      });
      draft.activity = draft.activity.slice(0, 500);
    });

    return { activityId, bonusCents, snapshot: toRendererSnapshot(state) };
  }

  async undoSuccess(activityId: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const activityIndex = draft.activity.findIndex(
        (entry) => entry.id === activityId && entry.type === 'success',
      );
      const activity = draft.activity[activityIndex];
      if (!activity || activity.siteId === null || activity.amountCents === null) {
        throw new ApplicationError('NOT_FOUND', 'That success can no longer be undone.', {
          field: 'activityId',
          recoverable: true,
        });
      }

      const date = localDateKey(activity.occurredAt);
      const metrics = draft.dailyRecords[date]?.[activity.siteId];
      if (!metrics || metrics.successes < 1 || metrics.earningsCents < activity.amountCents) {
        throw new ApplicationError('NOT_FOUND', 'The matching success record is unavailable.', {
          field: 'activityId',
          recoverable: true,
        });
      }

      metrics.successes -= 1;
      metrics.earningsCents -= activity.amountCents;
      draft.activity.splice(activityIndex, 1);
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  async setImageCleanerEnabled(enabled: boolean): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.settings.imageCleaner.enabled = enabled;
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async setImageCleanerFolder(folderPath: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.settings.imageCleaner.folderPath = folderPath;
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async setImageCompressorEnabled(enabled: boolean): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.settings.imageCompressor.enabled = enabled;
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async setImageCompressorFolder(folderPath: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.settings.imageCompressor.folderPath = folderPath;
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async upsertFacebookGroupShare(
    request: FacebookGroupShareUpsertRequest,
  ): Promise<FacebookGroupShareUpsertResponse> {
    const groupId = request.id ?? `facebook_group_${randomUUID()}`;
    const label = request.label.trim();
    const groupUrl = normaliseFacebookGroupUrl(request.groupUrl);
    const currentPostUrl = request.currentPostUrl?.trim()
      ? normaliseFacebookPostUrl(request.currentPostUrl)
      : null;

    const state = await this.stateService.update((draft) => {
      const groups = draft.settings.facebookGroupShares.groups;
      const existing =
        request.id === null ? null : groups.find((candidate) => candidate.id === request.id);
      if (request.id !== null && !existing) {
        throw new ApplicationError('NOT_FOUND', 'The Facebook group no longer exists.', {
          field: 'id',
          recoverable: true,
        });
      }

      const nextGroup = {
        id: groupId,
        label,
        groupUrl,
        currentPostUrl,
        useMostRecentPost: request.useMostRecentPost,
      };
      if (existing) groups[groups.indexOf(existing)] = nextGroup;
      else groups.push(nextGroup);
    });

    return { groupId, snapshot: toRendererSnapshot(state) };
  }

  async deleteFacebookGroupShare(groupId: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const groups = draft.settings.facebookGroupShares.groups;
      const index = groups.findIndex((group) => group.id === groupId);
      if (index < 0) {
        throw new ApplicationError('NOT_FOUND', 'The Facebook group no longer exists.', {
          field: 'groupId',
          recoverable: true,
        });
      }
      groups.splice(index, 1);
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async setImageCleanerHotkey(hotkey: string | null): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.settings.imageCleaner.hotkey = hotkey;
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async setCheckinSchedule(request: SetCheckinScheduleRequest): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.settings.checkin.scheduleEnabled = request.enabled;
      draft.settings.checkin.scheduleTime = request.time;
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async markScheduledCheckinAttempt(date: string): Promise<void> {
    await this.stateService.update((draft) => {
      draft.settings.checkin.lastScheduledRunDate = date;
    });
  }

  async setHotkeys(request: SetHotkeysRequest): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      draft.settings.hotkeys = {
        enabled: request.enabled,
        bindings: request.bindings.map((binding) => ({
          siteId: binding.siteId,
          key: binding.key,
        })),
      };
    });
    return { snapshot: toRendererSnapshot(state) };
  }

  async upsertTaskCategory(category: TaskCategory): Promise<TaskCategoryUpsertResponse> {
    const state = await this.stateService.update((draft) => {
      const sharedSites = normaliseSharedTaskSites(draft, category.sites);
      synchroniseSharedTaskSites(draft, sharedSites);
      const nextCategory = { ...structuredClone(category), sites: sharedSites };
      const index = draft.taskCategories.findIndex((candidate) => candidate.id === category.id);
      if (index < 0) draft.taskCategories.push(nextCategory);
      else draft.taskCategories[index] = nextCategory;

      const validSiteIds = new Set(sharedSites.map((site) => site.id));
      for (const dailyRecord of Object.values(draft.taskDailyRecords)) {
        const categoryRecord = dailyRecord[category.id];
        if (!categoryRecord) continue;
        for (const siteId of Object.keys(categoryRecord)) {
          if (!validSiteIds.has(siteId)) delete categoryRecord[siteId];
        }
      }

      pruneCheckinRecords(draft);
    });

    return { categoryId: category.id, snapshot: toRendererSnapshot(state) };
  }

  async addTaskSitesToCategories(
    request: AddTaskSitesToCategoriesRequest,
  ): Promise<AddTaskSitesToCategoriesResponse> {
    const updatedCategoryIds: string[] = [];
    const state = await this.stateService.update((draft) => {
      const categoryIds = [...new Set(request.categoryIds)];
      const targets = categoryIds.map((categoryId) => {
        const category = draft.taskCategories.find((candidate) => candidate.id === categoryId);
        if (!category) {
          throw new ApplicationError('NOT_FOUND', 'A selected category no longer exists.', {
            field: 'categoryIds',
            recoverable: true,
          });
        }
        return category;
      });

      if (
        request.newCategory &&
        draft.taskCategories.some((category) => category.id === request.newCategory?.id)
      ) {
        throw new ApplicationError('VALIDATION_FAILED', 'The new category ID is already in use.', {
          field: 'newCategory.id',
          recoverable: true,
        });
      }

      const sharedSites = normaliseSharedTaskSites(draft, request.sites);
      synchroniseSharedTaskSites(draft, sharedSites);

      for (const category of targets) {
        const existingIds = new Set(category.sites.map((site) => site.id));
        for (const site of sharedSites) {
          if (!existingIds.has(site.id)) category.sites.push(structuredClone(site));
        }
        updatedCategoryIds.push(category.id);
      }

      if (request.newCategory) {
        draft.taskCategories.push({
          ...structuredClone(request.newCategory),
          sites: structuredClone(sharedSites),
        });
        updatedCategoryIds.push(request.newCategory.id);
      }
    });

    return { categoryIds: updatedCategoryIds, snapshot: toRendererSnapshot(state) };
  }

  async deleteTaskCategory(categoryId: string): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const exists = draft.taskCategories.some((category) => category.id === categoryId);
      if (!exists) {
        throw new ApplicationError('NOT_FOUND', 'The task category no longer exists.', {
          field: 'categoryId',
          recoverable: true,
        });
      }

      draft.taskCategories = draft.taskCategories.filter((category) => category.id !== categoryId);
      for (const dailyRecord of Object.values(draft.taskDailyRecords)) {
        delete dailyRecord[categoryId];
      }

      pruneCheckinRecords(draft);
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  async recordCheckinResult(
    date: string,
    taskSiteId: string,
    result: CheckinResultRecord,
  ): Promise<void> {
    await this.stateService.update((draft) => {
      const day = (draft.checkinDailyRecords[date] ??= {});
      day[taskSiteId] = result;
    });
  }

  async setTaskCompletion(date: string, item: TaskCompletionItem): Promise<SnapshotResponse> {
    return this.setTaskCompletions(date, [item]);
  }

  async setTaskCompletions(date: string, items: TaskCompletionItem[]): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      const categoriesById = new Map<string, TaskCategory>();
      const categoryIdsBySiteId = new Map<string, string[]>();

      for (const category of draft.taskCategories) {
        categoriesById.set(category.id, category);
        for (const site of category.sites) {
          const categoryIds = categoryIdsBySiteId.get(site.id);
          if (categoryIds) categoryIds.push(category.id);
          else categoryIdsBySiteId.set(site.id, [category.id]);
        }
      }

      const day = (draft.taskDailyRecords[date] ??= {});
      for (const item of items) {
        if (!categoriesById.has(item.categoryId)) {
          throw new ApplicationError('NOT_FOUND', 'The task category no longer exists.', {
            field: 'categoryId',
            recoverable: true,
          });
        }
        const categoryIds = categoryIdsBySiteId.get(item.siteId);
        if (!categoryIds?.includes(item.categoryId)) {
          throw new ApplicationError('NOT_FOUND', 'The task site no longer exists.', {
            field: 'siteId',
            recoverable: true,
          });
        }

        for (const categoryId of categoryIds) {
          const categoryState = (day[categoryId] ??= {});
          categoryState[item.siteId] = item.done;
        }
      }
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  getRendererSnapshot(): RendererSnapshot {
    return toRendererSnapshot(this.stateService.getSnapshot());
  }
}

function normaliseSharedTaskSites(
  state: AppStateV1,
  incomingSites: readonly TaskSite[],
): TaskSite[] {
  const normalised = new Map<string, TaskSite>();
  const sharedIndex = buildSharedTaskSiteIndex(state);

  for (const incoming of incomingSites) {
    const existing = findSharedTaskSite(sharedIndex, incoming);
    const site: TaskSite = {
      ...(existing ? structuredClone(existing) : {}),
      ...structuredClone(incoming),
      id: existing?.id ?? incoming.id,
      ...((incoming.sourceSiteId ?? existing?.sourceSiteId)
        ? { sourceSiteId: incoming.sourceSiteId ?? existing?.sourceSiteId }
        : {}),
      ...((incoming.checkin ?? existing?.checkin)
        ? { checkin: structuredClone(incoming.checkin ?? existing?.checkin) }
        : {}),
    };
    normalised.set(site.id, site);
  }

  return [...normalised.values()];
}

interface SharedTaskSiteIndexEntry {
  site: TaskSite;
  order: number;
}

interface SharedTaskSiteIndex {
  byId: Map<string, SharedTaskSiteIndexEntry>;
  bySourceSiteId: Map<string, SharedTaskSiteIndexEntry>;
}

function buildSharedTaskSiteIndex(state: AppStateV1): SharedTaskSiteIndex {
  const byId = new Map<string, SharedTaskSiteIndexEntry>();
  const bySourceSiteId = new Map<string, SharedTaskSiteIndexEntry>();
  let order = 0;

  for (const category of state.taskCategories) {
    for (const site of category.sites) {
      const entry = { site, order };
      if (!byId.has(site.id)) byId.set(site.id, entry);
      if (site.sourceSiteId !== undefined && !bySourceSiteId.has(site.sourceSiteId)) {
        bySourceSiteId.set(site.sourceSiteId, entry);
      }
      order += 1;
    }
  }

  return { byId, bySourceSiteId };
}

function findSharedTaskSite(index: SharedTaskSiteIndex, incoming: TaskSite): TaskSite | null {
  const idMatch = index.byId.get(incoming.id);
  const sourceMatch =
    incoming.sourceSiteId === undefined
      ? undefined
      : index.bySourceSiteId.get(incoming.sourceSiteId);
  const match =
    idMatch && sourceMatch
      ? idMatch.order <= sourceMatch.order
        ? idMatch
        : sourceMatch
      : (idMatch ?? sourceMatch);
  return match?.site ?? null;
}

function synchroniseSharedTaskSites(state: AppStateV1, sharedSites: readonly TaskSite[]): void {
  const byId = new Map(sharedSites.map((site) => [site.id, site]));
  for (const category of state.taskCategories) {
    category.sites = category.sites.map((site) => {
      const shared = byId.get(site.id);
      return shared ? structuredClone(shared) : site;
    });
  }
}

function requireSite(state: AppStateV1, siteId: string): Site {
  const site = state.sites.find((candidate) => candidate.id === siteId);
  if (!site) {
    throw new ApplicationError('NOT_FOUND', 'The site no longer exists.', {
      field: 'siteId',
      recoverable: true,
    });
  }
  if ((site.lifecycle ?? 'active') !== 'active') {
    throw new ApplicationError('NOT_FOUND', 'That site is not active.', {
      field: 'siteId',
      recoverable: true,
    });
  }
  return site;
}

function pruneCheckinRecords(state: AppStateV1): void {
  const validSiteIds = new Set<string>();
  for (const category of state.taskCategories) {
    for (const site of category.sites) validSiteIds.add(site.id);
  }

  for (const [date, dayRecord] of Object.entries(state.checkinDailyRecords)) {
    for (const siteId of Object.keys(dayRecord)) {
      if (!validSiteIds.has(siteId)) delete dayRecord[siteId];
    }
    if (Object.keys(dayRecord).length === 0) delete state.checkinDailyRecords[date];
  }
}

function getOrCreateMetrics(state: AppStateV1, date: string, siteId: string): DailySiteMetrics {
  const dailyRecord = (state.dailyRecords[date] ??= {});
  return (dailyRecord[siteId] ??= { copies: 0, successes: 0, earningsCents: 0 });
}

function localDateKey(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    throw new ApplicationError('VALIDATION_FAILED', 'An invalid timestamp was supplied.', {
      field: 'occurredAt',
      recoverable: true,
    });
  }
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function normaliseFacebookGroupUrl(value: string): string {
  const url = parseFacebookUrl(value, 'groupUrl');
  const parts = url.pathname.split('/').filter(Boolean);
  const groupIndex = parts.findIndex((part) => part.toLowerCase() === 'groups');
  const groupId = groupIndex >= 0 ? parts[groupIndex + 1] : null;
  if (!groupId) {
    throw new ApplicationError('VALIDATION_FAILED', 'Enter a Facebook group URL.', {
      field: 'groupUrl',
      recoverable: true,
    });
  }
  return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/`;
}

function normaliseFacebookPostUrl(value: string): string {
  const url = parseFacebookUrl(value, 'currentPostUrl');
  url.protocol = 'https:';
  url.hostname = 'www.facebook.com';
  url.username = '';
  url.password = '';
  return url.toString();
}

function parseFacebookUrl(value: string, field: string): URL {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Unsupported protocol');
    }
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) {
      throw new Error('Not Facebook');
    }
    if (url.username || url.password) {
      throw new Error('Credentials are not allowed');
    }
    return url;
  } catch (error: unknown) {
    throw new ApplicationError('VALIDATION_FAILED', 'Enter a valid Facebook URL.', {
      field,
      recoverable: true,
      cause: error,
    });
  }
}
