import type { PlatformProfilesApplication } from '@eaw/application';
import {
  PlatformProfileListResponseSchema,
  PlatformProfileParamsSchema,
  PlatformProfileResponseSchema,
  PlatformProfilesParamsSchema,
  SavePlatformProfileInputSchema,
} from '@eaw/contracts';
import { DomainError, type ProductPlatformProfile } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerPlatformProfileRoutes(
  app: FastifyInstance,
  profiles: PlatformProfilesApplication | undefined,
): void {
  const required = (): PlatformProfilesApplication => {
    if (!profiles) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Platform profiles are not configured.');
    }
    return profiles;
  };
  app.get('/api/v1/products/:productId/platform-profiles', async (request) => {
    const parameters = parse(PlatformProfilesParamsSchema.safeParse(request.params));
    const items = await required().list(parameters.productId);
    return PlatformProfileListResponseSchema.parse({ items: items.map(toResponse) });
  });
  app.get('/api/v1/products/:productId/platform-profiles/:platformId', async (request) => {
    const parameters = parse(PlatformProfileParamsSchema.safeParse(request.params));
    const profile = await required().get(parameters.productId, parameters.platformId);
    if (!profile) throw new DomainError('NOT_FOUND', 'Platform profile was not found.');
    return toResponse(profile);
  });
  app.put('/api/v1/products/:productId/platform-profiles/:platformId', async (request) => {
    const parameters = parse(PlatformProfileParamsSchema.safeParse(request.params));
    const body = parse(SavePlatformProfileInputSchema.safeParse(request.body));
    const profile = await required().save(parameters.productId, parameters.platformId, {
      ...body,
      expectedUpdatedAt:
        body.expectedUpdatedAt === undefined ? undefined : new Date(body.expectedUpdatedAt),
    });
    return toResponse(profile);
  });
}

function parse<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success)
    throw new DomainError('VALIDATION_ERROR', 'Platform profile request is invalid.');
  return result.data;
}

function toResponse(profile: ProductPlatformProfile) {
  return PlatformProfileResponseSchema.parse({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  });
}
