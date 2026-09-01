import type { PlatformCapabilitiesApplication } from '@eaw/application';
import {
  PlatformCapabilitiesParamsSchema,
  PlatformCapabilitiesQuerySchema,
  PlatformCapabilitiesResponseSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerPlatformCapabilitiesRoute(
  app: FastifyInstance,
  application: PlatformCapabilitiesApplication | undefined,
): void {
  app.get('/api/v1/platforms/:platformId/capabilities', async (request) => {
    if (!application) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Platform capabilities are not configured.');
    }
    const parameters = parse(PlatformCapabilitiesParamsSchema.safeParse(request.params));
    const query = parse(PlatformCapabilitiesQuerySchema.safeParse(request.query));
    const result = application.get(parameters.platformId, query.categoryCode);
    return PlatformCapabilitiesResponseSchema.parse({
      platformId: result.context.platformId,
      profilePlatformId: result.context.profilePlatformId,
      displayName: result.displayName,
      capabilities: result.capabilities,
    });
  });
}

function parse<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) {
    throw new DomainError('VALIDATION_ERROR', 'Platform capability request is invalid.');
  }
  return result.data;
}
