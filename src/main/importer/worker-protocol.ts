import { z } from 'zod';

import type { IpcErrorCode } from '../../shared/ipc/result';
import type { ImporterStage } from '../../shared/ipc/contract';
import type { StaticImportResult } from './types';

const ImporterStageSchema = z.enum([
  'validating',
  'connecting',
  'downloading',
  'analysing',
  'browser-starting',
  'browser-loading',
  'browser-rendering',
  'finalising',
]);

const PartnerSiteSchema = z
  .object({ name: z.string().min(1).max(100), url: z.string().url().max(2048) })
  .strict();

const StaticImportResultSchema = z
  .object({
    brandName: z.string().max(100),
    sites: z.array(PartnerSiteSchema).max(500),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().max(500)).max(20),
    sourceUrl: z.string().url().max(2048),
    finalUrl: z.string().url().max(2048),
    redirectCount: z.number().int().min(0).max(5),
    requiresBrowserFallback: z.boolean(),
  })
  .strict();

export const WorkerStartMessageSchema = z
  .object({
    type: z.literal('start'),
    jobId: z.string().uuid(),
    url: z.string().min(1).max(2048),
  })
  .strict();

export const WorkerToMainMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('progress'),
      jobId: z.string().uuid(),
      stage: ImporterStageSchema,
      message: z.string().min(1).max(500),
      percent: z.number().min(0).max(100).nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('result'),
      jobId: z.string().uuid(),
      result: StaticImportResultSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      jobId: z.string().uuid(),
      error: z
        .object({
          code: z.string().min(1).max(100),
          message: z.string().min(1).max(500),
          recoverable: z.boolean(),
        })
        .strict(),
    })
    .strict(),
]);

export type WorkerStartMessage = z.infer<typeof WorkerStartMessageSchema>;
export type WorkerToMainMessage = z.infer<typeof WorkerToMainMessageSchema>;

export function progressWorkerMessage(
  jobId: string,
  stage: ImporterStage,
  message: string,
  percent: number | null,
): WorkerToMainMessage {
  return { type: 'progress', jobId, stage, message, percent };
}

export function resultWorkerMessage(
  jobId: string,
  result: StaticImportResult,
): WorkerToMainMessage {
  return { type: 'result', jobId, result };
}

export function errorWorkerMessage(
  jobId: string,
  error: { code: IpcErrorCode; message: string; recoverable: boolean },
): WorkerToMainMessage {
  return { type: 'error', jobId, error };
}
