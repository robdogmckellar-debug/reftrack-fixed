import { randomUUID } from 'node:crypto';

import type { AppStateV1 } from '../../domain/app-state';
import type { DailySiteMetrics } from '../../domain/entities/daily-metrics';
import type { Site } from '../../domain/entities/site';
import type { TaskCategory } from '../../domain/entities/task-category';
import type {
  RecordSuccessResponse,
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

  bootstrap(): SnapshotResponse {
    return { snapshot: this.getRendererSnapshot() };
  }

  async upsertSite(request: SiteUpsertRequest): Promise<SiteUpsertResponse> {
    const siteId = request.id ?? `site_${randomUUID()}`;

    const state = await this.stateService.update((draft) => {
      const site: Site = {
        id: siteId,
        name: request.name,
        url: request.url,
        prefix: request.prefix,
        suffix: request.suffix,
        dateFormat: request.dateFormat,
        bonusCents: request.bonusCents,
        maxCopiesPerDay: request.maxCopiesPerDay,
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

  async upsertTaskCategory(category: TaskCategory): Promise<TaskCategoryUpsertResponse> {
    const state = await this.stateService.update((draft) => {
      const index = draft.taskCategories.findIndex((candidate) => candidate.id === category.id);
      if (index < 0) draft.taskCategories.push(structuredClone(category));
      else draft.taskCategories[index] = structuredClone(category);

      const validSiteIds = new Set(category.sites.map((site) => site.id));
      for (const dailyRecord of Object.values(draft.taskDailyRecords)) {
        const categoryRecord = dailyRecord[category.id];
        if (!categoryRecord) continue;
        for (const siteId of Object.keys(categoryRecord)) {
          if (!validSiteIds.has(siteId)) delete categoryRecord[siteId];
        }
      }
    });

    return { categoryId: category.id, snapshot: toRendererSnapshot(state) };
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
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  async setTaskCompletion(date: string, item: TaskCompletionItem): Promise<SnapshotResponse> {
    return this.setTaskCompletions(date, [item]);
  }

  async setTaskCompletions(date: string, items: TaskCompletionItem[]): Promise<SnapshotResponse> {
    const state = await this.stateService.update((draft) => {
      for (const item of items) {
        const category = draft.taskCategories.find((candidate) => candidate.id === item.categoryId);
        if (!category) {
          throw new ApplicationError('NOT_FOUND', 'The task category no longer exists.', {
            field: 'categoryId',
            recoverable: true,
          });
        }
        if (!category.sites.some((site) => site.id === item.siteId)) {
          throw new ApplicationError('NOT_FOUND', 'The task site no longer exists.', {
            field: 'siteId',
            recoverable: true,
          });
        }

        const day = (draft.taskDailyRecords[date] ??= {});
        const categoryState = (day[item.categoryId] ??= {});
        categoryState[item.siteId] = item.done;
      }
    });

    return { snapshot: toRendererSnapshot(state) };
  }

  getRendererSnapshot(): RendererSnapshot {
    return toRendererSnapshot(this.stateService.getSnapshot());
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
  return site;
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
