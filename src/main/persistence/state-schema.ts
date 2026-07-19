import { z } from 'zod';

import { APP_STATE_SCHEMA_VERSION, type AppStateV1 } from '../../domain/app-state';
import { isValidIsoDate, isValidIsoTimestamp } from '../../shared/date/iso-date';
import { TASK_COLOURS } from '../../domain/entities/task-category';
import { DEFAULT_CHECKIN_SETTINGS } from '../../domain/entities/settings';
import { isValidHotkeyKey } from '../../shared/hotkeys/bindings';

const EntityIdSchema = z.string().trim().min(1).max(160);
const NonNegativeSafeIntegerSchema = z.number().int().nonnegative().safe();
const IsoDateSchema = z.string().refine(isValidIsoDate, 'Expected a valid yyyy-mm-dd date');
const IsoTimestampSchema = z.string().refine(isValidIsoTimestamp, 'Expected a valid timestamp');

const SiteSchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(100),
    url: z.string().max(2048),
    prefix: z.string().max(500),
    suffix: z.string().max(500),
    dateFormat: z.string().max(100),
    bonusCents: NonNegativeSafeIntegerSchema,
    maxCopiesPerDay: NonNegativeSafeIntegerSchema.max(1000),
    notes: z.string().max(4000).default(''),
    lifecycle: z.enum(['active', 'archived', 'trashed']).default('active'),
    lifecycleChangedAt: IsoTimestampSchema.nullable().default(null),
    payoutThresholdCents: NonNegativeSafeIntegerSchema.default(0),
    appClaim: z
      .object({
        enabled: z.boolean().default(false),
        downloadUrl: z.string().max(2048).default(''),
        apkPath: z.string().max(32767).nullable().default(null),
        packageName: z.string().max(255).default(''),
        deepLinkUrl: z.string().max(2048).default(''),
        avdName: z.string().max(160).default(''),
      })
      .strict()
      .default({
        enabled: false,
        downloadUrl: '',
        apkPath: null,
        packageName: '',
        deepLinkUrl: '',
        avdName: '',
      }),
  })
  .strict();

const DailySiteMetricsSchema = z
  .object({
    copies: NonNegativeSafeIntegerSchema,
    successes: NonNegativeSafeIntegerSchema,
    earningsCents: NonNegativeSafeIntegerSchema,
  })
  .strict();

const ActivityEntrySchema = z
  .object({
    id: EntityIdSchema,
    occurredAt: IsoTimestampSchema,
    type: z.enum(['copy', 'success', 'delete']),
    siteId: EntityIdSchema.nullable(),
    siteName: z.string().trim().min(1).max(100),
    amountCents: NonNegativeSafeIntegerSchema.nullable(),
  })
  .strict();

const PayoutEntrySchema = z
  .object({
    id: EntityIdSchema,
    siteId: EntityIdSchema,
    amountCents: NonNegativeSafeIntegerSchema.positive(),
    expectedDate: IsoDateSchema,
    paidAt: IsoTimestampSchema.nullable(),
    createdAt: IsoTimestampSchema,
    note: z.string().max(1000),
  })
  .strict();

const FacebookGroupShareSchema = z
  .object({
    id: EntityIdSchema,
    label: z.string().trim().min(1).max(120),
    groupUrl: z.string().trim().min(1).max(2048),
    currentPostUrl: z.string().trim().min(1).max(2048).nullable(),
    useMostRecentPost: z.boolean().default(false),
  })
  .strict();

const OptionalPathSchema = z.string().max(2048).optional();

const TaskSiteCheckinSchema = z
  .object({
    enabled: z.boolean(),
    loginPath: OptionalPathSchema,
    checkinPath: OptionalPathSchema,
  })
  .strict();

const TaskSiteSchema = z
  .object({
    id: EntityIdSchema,
    sourceSiteId: EntityIdSchema.optional(),
    name: z.string().trim().min(1).max(100),
    url: z.string().max(2048),
    checkin: TaskSiteCheckinSchema.optional(),
  })
  .strict();

const CheckinSettingsSchema = z
  .object({
    scheduleEnabled: z.boolean().default(false),
    scheduleTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour HH:mm time')
      .default('09:00'),
    lastScheduledRunDate: IsoDateSchema.nullable().default(null),
    loginPath: z.string().max(2048),
    checkinPath: z.string().max(2048),
    usernameSelector: z.string().max(1000),
    passwordSelector: z.string().max(1000),
    submitSelector: z.string().max(1000),
    checkinButtonSelector: z.string().max(1000),
    dismissSelector: z.string().max(1000),
    successSelector: z.string().max(1000),
  })
  .strict();

const CheckinResultRecordSchema = z
  .object({
    status: z.enum(['success', 'failed', 'skipped']),
    at: IsoTimestampSchema,
    message: z.string().max(500).optional(),
  })
  .strict();

const TaskCategorySchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(100),
    colour: z.enum(TASK_COLOURS),
    sites: z.array(TaskSiteSchema).max(1000),
  })
  .strict()
  .superRefine((category, context) => {
    const ids = new Set<string>();
    category.sites.forEach((site, index) => {
      if (ids.has(site.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate task-site ID: ${site.id}`,
          path: ['sites', index, 'id'],
        });
      }
      ids.add(site.id);
    });
  });

export const AppStateV1Schema = z
  .object({
    schemaVersion: z.literal(APP_STATE_SCHEMA_VERSION),
    revision: NonNegativeSafeIntegerSchema,
    sites: z.array(SiteSchema).max(1000),
    dailyRecords: z.record(IsoDateSchema, z.record(EntityIdSchema, DailySiteMetricsSchema)),
    activity: z.array(ActivityEntrySchema).max(500),
    settings: z
      .object({
        darkMode: z.boolean(),
        imageCleaner: z
          .object({
            enabled: z.boolean(),
            folderPath: z.string().max(32767).nullable(),
            // Additive nullable field: existing v1 files without it default to
            // null on load, so no schema-version bump/migration is required.
            hotkey: z.string().max(120).nullable().default(null),
          })
          .strict(),
        imageCompressor: z
          .object({
            enabled: z.boolean(),
            folderPath: z.string().max(32767).nullable(),
            quality: z.number().int().min(1).max(100).default(70),
          })
          .strict()
          .default({ enabled: false, folderPath: null, quality: 70 }),
        facebookGroupShares: z
          .object({
            groups: z.array(FacebookGroupShareSchema).max(1000),
          })
          .strict()
          .default({ groups: [] }),
        checkin: CheckinSettingsSchema.default({ ...DEFAULT_CHECKIN_SETTINGS }),
        hotkeys: z
          .object({
            enabled: z.boolean(),
            bindings: z
              .array(
                z
                  .object({
                    siteId: EntityIdSchema,
                    key: z
                      .string()
                      .refine(
                        (value) => value === '' || isValidHotkeyKey(value),
                        'Expected a supported hotkey key',
                      ),
                  })
                  .strict(),
              )
              .max(1000),
          })
          .strict()
          .default({ enabled: true, bindings: [] }),
      })
      .strict(),
    taskCategories: z.array(TaskCategorySchema).max(500),
    taskDailyRecords: z.record(
      IsoDateSchema,
      z.record(EntityIdSchema, z.record(EntityIdSchema, z.boolean())),
    ),
    checkinDailyRecords: z
      .record(IsoDateSchema, z.record(EntityIdSchema, CheckinResultRecordSchema))
      .default({}),
    payouts: z.array(PayoutEntrySchema).max(10000).default([]),
  })
  .strict()
  .superRefine((state, context) => {
    const siteIds = new Set<string>();
    state.sites.forEach((site, index) => {
      if (siteIds.has(site.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate site ID: ${site.id}`,
          path: ['sites', index, 'id'],
        });
      }
      siteIds.add(site.id);
    });

    const payoutIds = new Set<string>();
    state.payouts.forEach((payout, index) => {
      if (payoutIds.has(payout.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate payout ID: ${payout.id}`,
          path: ['payouts', index, 'id'],
        });
      }
      if (!siteIds.has(payout.siteId)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown payout site ID: ${payout.siteId}`,
          path: ['payouts', index, 'siteId'],
        });
      }
      payoutIds.add(payout.id);
    });

    const facebookGroupIds = new Set<string>();
    state.settings.facebookGroupShares.groups.forEach((group, index) => {
      if (facebookGroupIds.has(group.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate Facebook group ID: ${group.id}`,
          path: ['settings', 'facebookGroupShares', 'groups', index, 'id'],
        });
      }
      facebookGroupIds.add(group.id);
    });

    const categoryIds = new Set<string>();
    state.taskCategories.forEach((category, index) => {
      if (categoryIds.has(category.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate task-category ID: ${category.id}`,
          path: ['taskCategories', index, 'id'],
        });
      }
      categoryIds.add(category.id);
    });
  });

export function parseAppState(value: unknown): AppStateV1 {
  return AppStateV1Schema.parse(stripRetiredAutoShareFields(value));
}

function stripRetiredAutoShareFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  const state = { ...(value as Record<string, unknown>) };
  delete state.autoShareRotation;

  if (Array.isArray(state.sites)) {
    state.sites = state.sites.map((site) => {
      if (!site || typeof site !== 'object' || Array.isArray(site)) return site;
      const cleaned = { ...(site as Record<string, unknown>) };
      delete cleaned.autoShareEnabled;
      delete cleaned.groupsPerRun;
      return cleaned;
    });
  }

  if (state.settings && typeof state.settings === 'object' && !Array.isArray(state.settings)) {
    const settings = { ...(state.settings as Record<string, unknown>) };
    delete settings.autoShare;
    state.settings = settings;
  }

  return state;
}
