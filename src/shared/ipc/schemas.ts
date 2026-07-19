import { z } from 'zod';

import { isValidIsoDate } from '../date/iso-date';
import { isValidHotkeyKey } from '../hotkeys/bindings';

export const EmptyRequestSchema = z.undefined();

const EntityIdSchema = z.string().trim().min(1).max(160);
const IsoDateSchema = z.string().refine(isValidIsoDate, 'Expected a valid yyyy-mm-dd date');
const IsoTimestampSchema = z.string().datetime({ offset: true });
const SafeCountSchema = z.number().int().nonnegative().safe();
const OptionalAvdNameSchema = z.string().trim().min(1).max(160).nullable().optional();
const OptionalCredentialFreeHttpsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(isOptionalCredentialFreeHttpsUrl, 'Expected a credential-free HTTPS URL');

export const SiteUpsertRequestSchema = z
  .object({
    id: EntityIdSchema.nullable(),
    name: z.string().trim().min(1).max(100),
    url: OptionalCredentialFreeHttpsUrlSchema,
    prefix: z.string().max(500),
    suffix: z.string().max(500),
    dateFormat: z.string().max(100),
    bonusCents: SafeCountSchema,
    maxCopiesPerDay: SafeCountSchema.max(1000),
    notes: z.string().max(4000).default(''),
    payoutThresholdCents: SafeCountSchema.default(0),
    appClaim: z
      .object({
        enabled: z.boolean(),
        downloadUrl: z.string().trim().max(2048),
        apkPath: z.string().trim().min(1).max(32767).nullable(),
        packageName: z.string().trim().max(255),
        deepLinkUrl: z.string().trim().max(2048),
        avdName: z.string().trim().max(160),
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

export const SiteDeleteRequestSchema = z
  .object({
    siteId: EntityIdSchema,
    occurredAt: IsoTimestampSchema,
  })
  .strict();

export const SiteLifecycleRequestSchema = z
  .object({
    siteId: EntityIdSchema,
    lifecycle: z.enum(['active', 'archived', 'trashed']),
    occurredAt: IsoTimestampSchema,
  })
  .strict();

export const InstallApkRequestSchema = z
  .object({
    apkPath: z.string().trim().min(1).max(32767),
    avdName: OptionalAvdNameSchema,
  })
  .strict();

export const LaunchAndroidPackageRequestSchema = z
  .object({
    packageName: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/,
        'Expected an Android package name',
      )
      .max(255),
    avdName: OptionalAvdNameSchema,
  })
  .strict();

export const OpenAndroidDeepLinkRequestSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    avdName: OptionalAvdNameSchema,
  })
  .strict();

export const PayoutUpsertRequestSchema = z
  .object({
    id: EntityIdSchema.nullable(),
    siteId: EntityIdSchema,
    amountCents: SafeCountSchema.positive(),
    expectedDate: IsoDateSchema,
    paidAt: IsoTimestampSchema.nullable(),
    occurredAt: IsoTimestampSchema,
    note: z.string().max(1000),
  })
  .strict();

export const PayoutDeleteRequestSchema = z.object({ payoutId: EntityIdSchema }).strict();

export const CopyLinkRequestSchema = z
  .object({
    siteId: EntityIdSchema,
    text: z.string().min(1).max(8192),
    occurredAt: IsoTimestampSchema,
    imagePath: z.string().trim().min(1).max(4096).nullable().optional(),
  })
  .strict();

export const CopyTextRequestSchema = z
  .object({
    text: z.string().min(1).max(8192),
    imagePath: z.string().trim().min(1).max(4096).nullable().optional(),
  })
  .strict();

export const RecordSuccessRequestSchema = z
  .object({
    siteId: EntityIdSchema,
    occurredAt: IsoTimestampSchema,
  })
  .strict();

export const UndoSuccessRequestSchema = z
  .object({
    activityId: EntityIdSchema,
  })
  .strict();

export const SetImageCleanerEnabledRequestSchema = z.object({ enabled: z.boolean() }).strict();

export const SetImageCompressorEnabledRequestSchema = z.object({ enabled: z.boolean() }).strict();

export const FacebookGroupShareUpsertRequestSchema = z
  .object({
    id: EntityIdSchema.nullable(),
    label: z.string().trim().min(1).max(120),
    groupUrl: z.string().trim().min(1).max(2048),
    currentPostUrl: z.string().trim().min(1).max(2048).nullable(),
    useMostRecentPost: z.boolean(),
  })
  .strict();

export const FacebookGroupShareDeleteRequestSchema = z.object({ groupId: EntityIdSchema }).strict();

export const SetImageCleanerHotkeyRequestSchema = z
  .object({ hotkey: z.string().trim().min(1).max(120).nullable() })
  .strict();

export const SetCheckinScheduleRequestSchema = z
  .object({
    enabled: z.boolean(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour HH:mm time'),
  })
  .strict();

export const SetHotkeysRequestSchema = z
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
  .strict();

const TaskSiteCheckinSchema = z
  .object({
    enabled: z.boolean(),
    loginPath: z.string().max(2048).optional(),
    checkinPath: z.string().max(2048).optional(),
  })
  .strict();

const TaskSiteSchema = z
  .object({
    id: EntityIdSchema,
    sourceSiteId: EntityIdSchema.optional(),
    name: z.string().trim().min(1).max(100),
    url: OptionalCredentialFreeHttpsUrlSchema,
    checkin: TaskSiteCheckinSchema.optional(),
  })
  .strict();

export const TaskCategorySchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(100),
    colour: z.enum(['teal', 'purple', 'green', 'gold', 'orange', 'red', 'blue', 'pink']),
    sites: z.array(TaskSiteSchema).max(1000),
  })
  .strict();

export const TaskCategoryUpsertRequestSchema = z.object({ category: TaskCategorySchema }).strict();

export const AddTaskSitesToCategoriesRequestSchema = z
  .object({
    sites: z.array(TaskSiteSchema).min(1).max(1000),
    categoryIds: z.array(EntityIdSchema).max(500),
    newCategory: z
      .object({
        id: EntityIdSchema,
        name: z.string().trim().min(1).max(100),
        colour: z.enum(['teal', 'purple', 'green', 'gold', 'orange', 'red', 'blue', 'pink']),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((request) => request.categoryIds.length > 0 || request.newCategory !== null, {
    message: 'Choose an existing category or create a new category',
    path: ['categoryIds'],
  });

export const TaskCategoryDeleteRequestSchema = z.object({ categoryId: EntityIdSchema }).strict();

export const TaskCompletionRequestSchema = z
  .object({
    date: IsoDateSchema,
    categoryId: EntityIdSchema,
    siteId: EntityIdSchema,
    done: z.boolean(),
  })
  .strict();

export const TaskCompletionsRequestSchema = z
  .object({
    date: IsoDateSchema,
    items: z
      .array(
        z
          .object({
            categoryId: EntityIdSchema,
            siteId: EntityIdSchema,
            done: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();

export const OpenExternalRequestSchema = z
  .object({ url: z.string().trim().min(1).max(2048) })
  .strict();

export const ActionNotificationRequestSchema = z
  .object({
    kind: z.enum(['copy', 'success']),
    siteName: z.string().trim().min(1).max(100),
    amountCents: SafeCountSchema.nullable(),
  })
  .strict();

export const ImporterStartRequestSchema = z
  .object({ url: z.string().trim().min(1).max(2048) })
  .strict();

export const ImporterCancelRequestSchema = z.object({ jobId: EntityIdSchema }).strict();

export const CheckinStartRequestSchema = z
  .object({ taskSiteId: EntityIdSchema.nullable() })
  .strict();

export const CheckinCancelRequestSchema = z.object({ runId: EntityIdSchema }).strict();

export const CheckinSaveCredentialsRequestSchema = z
  .object({
    taskSiteId: EntityIdSchema,
    username: z.string().min(1).max(4096),
    password: z.string().min(1).max(4096),
  })
  .strict();

export const CheckinDeleteCredentialsRequestSchema = z
  .object({ taskSiteId: EntityIdSchema })
  .strict();

function isOptionalCredentialFreeHttpsUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
