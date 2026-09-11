import { MAX_RESTORE_UPLOAD_BYTES, type DataManagementApplication } from '@eaw/application';
import {
  BackupListResponseSchema,
  BackupParamsSchema,
  BackupResponseSchema,
  RestoreStatusResponseSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerDataManagementRoutes(
  app: FastifyInstance,
  application: DataManagementApplication | undefined,
): void {
  app.addContentTypeParser(
    'application/zip',
    { parseAs: 'buffer', bodyLimit: MAX_RESTORE_UPLOAD_BYTES },
    (_request, body, done) => done(null, body),
  );

  const required = (): DataManagementApplication => {
    if (!application) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Data management is unavailable.');
    }
    return application;
  };

  app.post('/api/v1/data-management/backups', async (_request, reply) =>
    reply.code(201).send(BackupResponseSchema.parse(await required().createBackup())),
  );

  app.get('/api/v1/data-management/backups', async () =>
    BackupListResponseSchema.parse({ items: await required().listBackups() }),
  );

  app.get('/api/v1/data-management/backups/:backupId/download', async (request, reply) => {
    const { backupId } = parse(BackupParamsSchema.safeParse(request.params));
    const download = await required().readBackup(backupId);
    reply.header('content-type', 'application/zip');
    reply.header('content-disposition', `attachment; filename="${backupId}.eaw-backup.zip"`);
    return reply.send(Buffer.from(download.bytes));
  });

  app.post('/api/v1/data-management/restores', async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) {
      throw new DomainError('VALIDATION_ERROR', 'Workspace restore upload is invalid.');
    }
    const status = await required().stageRestore(Uint8Array.from(request.body));
    return reply.code(202).send(RestoreStatusResponseSchema.parse(status));
  });

  app.get('/api/v1/data-management/restore-status', async () =>
    RestoreStatusResponseSchema.parse(await required().restoreStatus()),
  );
}

function parse<T>(
  result: { readonly success: true; readonly data: T } | { readonly success: false },
): T {
  if (!result.success) {
    throw new DomainError('VALIDATION_ERROR', 'Data management request is invalid.');
  }
  return result.data;
}
