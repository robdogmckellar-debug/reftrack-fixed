import { z } from 'zod';

import { APP_STATE_SCHEMA_VERSION, type AppStateV1 } from '../../domain/app-state';
import { isValidIsoDate, isValidIsoTimestamp } from '../../shared/date/iso-date';
import { TASK_COLOURS } from '../../domain/entities/task-category';
import { DEFAULT_CHECKIN_SETTINGS } from '../../domain/entities/settings';

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
    name: z.string().trim().min(1).max(100),
    url: z.string().max(2048),
    checkin: TaskSiteCheckinSchema.optional(),
  })
  .strict();

const CheckinSettingsSchema = z
  .object({
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
          })
          .strict(),
        checkin: CheckinSettingsSchema.default({ ...DEFAULT_CHECKIN_SETTINGS }),
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
  return AppStateV1Schema.parse(value);
}
