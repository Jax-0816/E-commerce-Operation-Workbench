import { z } from 'zod';

const UuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const TimestampSchema = z.string().refine((value) => {
  const date = new Date(value);
  return Number.isSafeInteger(date.getTime()) && date.toISOString() === value;
});
const VersionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u);

export const BackupParamsSchema = z.object({ backupId: UuidSchema }).strict();

export const BackupResponseSchema = z
  .object({
    appVersion: VersionSchema,
    backupId: UuidSchema,
    createdAt: TimestampSchema,
    size: z.number().int().safe().nonnegative(),
    downloadUrl: z.string(),
  })
  .strict()
  .refine(
    (value) => value.downloadUrl === `/api/v1/data-management/backups/${value.backupId}/download`,
    { path: ['downloadUrl'] },
  );

export const BackupListResponseSchema = z.object({ items: z.array(BackupResponseSchema) }).strict();

const IdleRestoreStatusSchema = z.object({ state: z.literal('idle') }).strict();
const PendingRestoreStatusSchema = z
  .object({
    state: z.literal('pending'),
    backupId: UuidSchema,
    restoreId: UuidSchema,
    stagedAt: TimestampSchema,
    restartRequired: z.literal(true),
  })
  .strict();
const AppliedRestoreStatusSchema = z
  .object({
    state: z.literal('applied'),
    backupId: UuidSchema,
    restoreId: UuidSchema,
    completedAt: TimestampSchema,
  })
  .strict();
const FailedRestoreStatusSchema = z
  .object({
    state: z.literal('failed'),
    backupId: UuidSchema,
    restoreId: UuidSchema,
    completedAt: TimestampSchema,
    message: z.literal('Restore failed; original workspace was preserved.'),
  })
  .strict();

export const RestoreStatusResponseSchema = z.discriminatedUnion('state', [
  IdleRestoreStatusSchema,
  PendingRestoreStatusSchema,
  AppliedRestoreStatusSchema,
  FailedRestoreStatusSchema,
]);

export type BackupResponse = z.infer<typeof BackupResponseSchema>;
export type RestoreStatusResponse = z.infer<typeof RestoreStatusResponseSchema>;
