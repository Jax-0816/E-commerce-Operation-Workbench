import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import type { AppContext } from './context.js';
import { registerHealthRoute } from './routes/health.js';

export function buildApp(context: AppContext): FastifyInstance {
  const app = Fastify();

  registerHealthRoute(app, context);

  if (context.webDistDir !== undefined && existsSync(context.webDistDir)) {
    app.register(fastifyStatic, {
      root: context.webDistDir,
      wildcard: false,
    });
    app.get('/*', (_request, reply) => reply.sendFile('index.html'));
  }

  return app;
}
