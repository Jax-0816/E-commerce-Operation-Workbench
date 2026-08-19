import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../context.js';

export function registerHealthRoute(app: FastifyInstance, context: AppContext): void {
  app.get('/api/v1/health', () => ({
    status: 'ok',
    appVersion: context.appVersion,
  }));
}
