import type { DashboardApplication } from '@eaw/application';
import { DashboardResponseSchema } from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerDashboardRoute(
  app: FastifyInstance,
  application: DashboardApplication | undefined,
): void {
  app.get('/api/v1/dashboard', async (request) => {
    const contentLength = request.headers['content-length'];
    if (
      request.body !== undefined ||
      (contentLength !== undefined && contentLength !== '0') ||
      request.headers['transfer-encoding'] !== undefined ||
      Object.keys(request.query as object).length > 0
    ) {
      throw new DomainError('VALIDATION_ERROR', 'Dashboard request is invalid.');
    }
    if (application === undefined) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Dashboard is not configured.');
    }
    return DashboardResponseSchema.parse(await application.get());
  });
}
