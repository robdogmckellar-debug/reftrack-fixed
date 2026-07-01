import { createHash } from 'node:crypto';

import { z } from 'zod';

import { APP_STATE_SCHEMA_VERSION, type AppStateV1 } from '../../domain/app-state';
import { isValidIsoDate, isValidIsoTimestamp } from '../../domain/date/iso-date';
import { dollarsToCents, centsToDollars } from '../../domain/money/money';
import { calculateLifetimeTotals, calculateSiteTotals } from '../../domain/selectors/statistics';
import { parseAppState } from '../persistence/state-schema';
import type { RendererSnapshot } from '../../shared/view-model/renderer-snapshot';

const LegacyIdSchema = z.string().trim().min(1).max(160);
const LegacyDateSchema = z.string().refine(isValidIsoDate);
const LegacyCountSchema = z.number().finite().nonnegative();
const LegacyMoneySchema = z.number().finite();

const LegacySiteSchema = z.object({
  id: LegacyIdSchema,
  name: z.string().trim().min(1).max(100),
  url: z.string().max(2048).default(''),
  prefix: z.string().max(500).default(''),
  suffix: z.string().max(500).default(''),
  dateFormat: z.string().max(100).default(''),
  bonus: LegacyMoneySchema.nonnegative().default(0),
  maxCopiesPerDay: LegacyCountSchema.default(1),
  copies: LegacyCountSchema.optional(),
  successes: LegacyCountSchema.optional(),
  earnings: LegacyMoneySchema.optional(),
});

const LegacyDailyMetricsSchema = z.object({
  copies: LegacyCountSchema.default(0),
  successes: LegacyCountSchema.default(0),
  earnings: LegacyMoneySchema.nonnegative().default(0),
});

const LegacyActivitySchema = z.object({
  id: LegacyIdSchema.optional(),
  occurredAt: z.string().optional(),
  time: z.string().max(20).optional(),
  type: z.enum(['copy', 'success', 'delete']),
  siteId: LegacyIdSchema.nullable().optional(),
  siteName: z.string().trim().min(1).max(100),
  amount: LegacyMoneySchema.nullable().optional(),
  ts: z.number().finite().optional(),
});

const LegacyTaskSiteSchema = z.object({
  id: LegacyIdSchema,
  name: z.string().trim().min(1).max(100),
  url: z.string().max(2048).default(''),
});

const LegacyTaskCategorySchema = z.object({
  id: LegacyIdSchema,
  name: z.string().trim().min(1).max(100),
  colour: z
    .enum(['teal', 'purple', 'green', 'gold', 'orange', 'red', 'blue', 'pink'])
    .default('teal'),
  sites: z.array(LegacyTaskSiteSchema).max(1000).default([]),
});

const LegacyAppDataSchema = z.object({
  sites: z.array(LegacySiteSchema).max(1000),
  dailyState: z
    .record(LegacyDateSchema, z.record(LegacyIdSchema, LegacyDailyMetricsSchema))
    .default({}),
  activity: z.array(LegacyActivitySchema).max(500).default([]),
  lifetimeEarnings: LegacyMoneySchema.optional(),
  lifetimeSuccesses: LegacyCountSchema.optional(),
  settings: z
    .object({
      darkMode: z.boolean().default(true),
      folderClearEnabled: z.boolean().default(false),
      folderClearPath: z.string().max(32767).nullable().optional(),
    })
    .default({ darkMode: true, folderClearEnabled: false }),
  tasks: z
    .object({
      categories: z.array(LegacyTaskCategorySchema).max(500).default([]),
    })
    .default({ categories: [] }),
  tasksDailyState: z
    .record(LegacyDateSchema, z.record(LegacyIdSchema, z.record(LegacyIdSchema, z.boolean())))
    .default({}),
});

export type LegacyAppData = z.infer<typeof LegacyAppDataSchema>;

export function toLegacyAppData(state: AppStateV1): RendererSnapshot {
  const lifetime = calculateLifetimeTotals(state);

  return {
    revision: state.revision,
    sites: state.sites.map((site) => {
      const totals = calculateSiteTotals(state, site.id);
      return {
        id: site.id,
        name: site.name,
        url: site.url,
        prefix: site.prefix,
        suffix: site.suffix,
        dateFormat: site.dateFormat,
        bonus: centsToDollars(site.bonusCents),
        maxCopiesPerDay: site.maxCopiesPerDay,
        copies: totals.copies,
        successes: totals.successes,
        earnings: centsToDollars(totals.earningsCents),
      };
    }),
    dailyState: Object.fromEntries(
      Object.entries(state.dailyRecords).map(([date, day]) => [
        date,
        Object.fromEntries(
          Object.entries(day).map(([siteId, metrics]) => [
            siteId,
            {
              copies: metrics.copies,
              successes: metrics.successes,
              earnings: centsToDollars(metrics.earningsCents),
            },
          ]),
        ),
      ]),
    ),
    activity: state.activity.map((entry) => {
      const occurredAt = new Date(entry.occurredAt);
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        time: formatLocalTime(occurredAt),
        type: entry.type,
        siteId: entry.siteId,
        siteName: entry.siteName,
        amount: entry.amountCents === null ? null : centsToDollars(entry.amountCents),
        ts: occurredAt.getTime(),
      };
    }),
    lifetimeEarnings: centsToDollars(lifetime.earningsCents),
    lifetimeSuccesses: lifetime.successes,
    settings: {
      darkMode: state.settings.darkMode,
      folderClearEnabled: state.settings.imageCleaner.enabled,
      folderClearPath: state.settings.imageCleaner.folderPath,
    },
    tasks: {
      categories: structuredClone(state.taskCategories),
    },
    tasksDailyState: structuredClone(state.taskDailyRecords),
  };
}

export function toCanonicalAppState(
  legacyValue: LegacyAppData,
  previousState: AppStateV1,
): AppStateV1 {
  const legacy = LegacyAppDataSchema.parse(legacyValue);
  const siteIdByName = new Map(
    legacy.sites.map((site) => [site.name.trim().toLocaleLowerCase(), site.id] as const),
  );

  const taskCategories = structuredClone(legacy.tasks.categories);
  const taskIds = new Map(
    taskCategories.map((category) => [category.id, new Set(category.sites.map((site) => site.id))]),
  );

  const state: AppStateV1 = {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    revision: previousState.revision,
    sites: legacy.sites.map((site) => ({
      id: site.id,
      name: site.name,
      url: site.url,
      prefix: site.prefix,
      suffix: site.suffix,
      dateFormat: site.dateFormat,
      bonusCents: dollarsToCents(site.bonus),
      maxCopiesPerDay: Math.trunc(site.maxCopiesPerDay),
    })),
    dailyRecords: Object.fromEntries(
      Object.entries(legacy.dailyState).map(([date, day]) => [
        date,
        Object.fromEntries(
          Object.entries(day).map(([siteId, metrics]) => [
            siteId,
            {
              copies: Math.trunc(metrics.copies),
              successes: Math.trunc(metrics.successes),
              earningsCents: dollarsToCents(metrics.earnings),
            },
          ]),
        ),
      ]),
    ),
    activity: legacy.activity.slice(0, 500).map((entry, index) => {
      const occurredAt = resolveOccurredAt(entry.occurredAt, entry.ts);
      return {
        id: entry.id ?? createActivityId(entry, occurredAt, index),
        occurredAt,
        type: entry.type,
        siteId: entry.siteId ?? siteIdByName.get(entry.siteName.trim().toLocaleLowerCase()) ?? null,
        siteName: entry.siteName,
        amountCents: entry.amount == null ? null : dollarsToCents(entry.amount),
      };
    }),
    settings: {
      darkMode: legacy.settings.darkMode,
      imageCleaner: {
        enabled: legacy.settings.folderClearEnabled,
        folderPath: legacy.settings.folderClearPath ?? null,
      },
    },
    taskCategories,
    taskDailyRecords: sanitiseTaskDailyRecords(legacy.tasksDailyState, taskIds),
  };

  return parseAppState(state);
}

function sanitiseTaskDailyRecords(
  records: LegacyAppData['tasksDailyState'],
  validTaskIds: Map<string, Set<string>>,
): AppStateV1['taskDailyRecords'] {
  return Object.fromEntries(
    Object.entries(records).map(([date, categories]) => [
      date,
      Object.fromEntries(
        Object.entries(categories).flatMap(([categoryId, sites]) => {
          const validSiteIds = validTaskIds.get(categoryId);
          if (!validSiteIds) return [];

          return [
            [
              categoryId,
              Object.fromEntries(
                Object.entries(sites).filter(([siteId]) => validSiteIds.has(siteId)),
              ),
            ],
          ];
        }),
      ),
    ]),
  );
}

function resolveOccurredAt(occurredAt: string | undefined, timestamp: number | undefined): string {
  if (occurredAt && isValidIsoTimestamp(occurredAt)) return new Date(occurredAt).toISOString();
  if (timestamp !== undefined) {
    const date = new Date(timestamp);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function createActivityId(
  entry: z.infer<typeof LegacyActivitySchema>,
  occurredAt: string,
  index: number,
): string {
  const digest = createHash('sha256')
    .update(`${occurredAt}|${entry.type}|${entry.siteName}|${entry.amount ?? ''}|${index}`)
    .digest('hex')
    .slice(0, 20);
  return `activity_${digest}`;
}

function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
