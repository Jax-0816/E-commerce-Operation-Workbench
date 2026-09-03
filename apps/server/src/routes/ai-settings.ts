import type { AISettingsApplication } from '@eaw/application';
import {
  AISettingsResponseSchema,
  ConfigureAISettingsInputSchema,
  TestAIConnectionResponseSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerAISettingsRoutes(
  app: FastifyInstance,
  application: AISettingsApplication | undefined,
): void {
  const required = () => {
    if (!application) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'AI settings are not configured.');
    }
    return application;
  };
  app.get('/api/v1/ai/settings', async () =>
    AISettingsResponseSchema.parse(await required().get()),
  );
  app.put('/api/v1/ai/settings', async (request) => {
    const parsed = ConfigureAISettingsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 'AI settings request is invalid.');
    }
    return AISettingsResponseSchema.parse(await required().configure(parsed.data));
  });
  app.delete('/api/v1/ai/settings', async () =>
    AISettingsResponseSchema.parse(await required().clear()),
  );
  app.post('/api/v1/ai/settings/test', async () =>
    TestAIConnectionResponseSchema.parse(await required().testConnection()),
  );
}
