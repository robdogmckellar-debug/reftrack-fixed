import { z } from 'zod';

import { isValidIsoDate } from '../date/iso-date';

export const EmptyRequestSchema = z.undefined();

const EntityIdSchema = z.string().trim().min(1).max(160);
const IsoDateSchema = z.string().refine(isValidIsoDate, 'Expected a valid yyyy-mm-dd date');
const IsoTimestampSchema = z.string().datetime({ offset: true });
const SafeCountSchema = z.number().int().nonnegative().safe();
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
  })
  .strict();

export const SiteDeleteRequestSchema = z
  .object({
    siteId: EntityIdSchema,
    occurredAt: IsoTimestampSchema,
  })
  .strict();

export const CopyLinkRequestSchema = z
  .object({
    siteId: EntityIdSchema,
    text: z.string().min(1).max(8192),
    occurredAt: IsoTimestampSchema,
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

export const SetImageCleanerHotkeyRequestSchema = z
  .object({ hotkey: z.string().trim().min(1).max(120).nullable() })
  .strict();

const TaskSiteSchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(100),
    url: OptionalCredentialFreeHttpsUrlSchema,
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

function isOptionalCredentialFreeHttpsUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
