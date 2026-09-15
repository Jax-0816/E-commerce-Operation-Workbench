import type { SystemStatusApplication } from '@eaw/application';
import { SystemStatusResponseSchema } from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerSystemStatusRoute(
  app: FastifyInstance,
  application: SystemStatusApplication | undefined,
): void {
  app.get('/api/v1/system/status', async () => {
    if (application === undefined) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'System status is not configured.');
    }
    return SystemStatusResponseSchema.parse(await application.get());
  });
}
