import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import { toErrorResponse } from '@eaw/contracts';
import { DomainError } from '@eaw/domain';

import type { AppContext } from './context.js';
import { registerHealthRoute } from './routes/health.js';
import { registerProductRoutes } from './routes/products.js';
import { registerFactRoutes } from './routes/facts.js';
import { registerSkuRoutes } from './routes/skus.js';

export function buildApp(context: AppContext): FastifyInstance {
  const app = Fastify();

  app.setErrorHandler((error, request, reply) => {
    const response = toErrorResponse(error, request.id);
    const statusCode = error instanceof DomainError ? errorStatusCode(error.code) : 503;
    reply.code(statusCode).send(response);
  });

  registerHealthRoute(app, context);
  registerProductRoutes(app, context.products);
  registerFactRoutes(app, context.facts);
  registerSkuRoutes(app, context.skus);

  if (context.webDistDir !== undefined && existsSync(context.webDistDir)) {
    app.register(fastifyStatic, {
      root: context.webDistDir,
      wildcard: false,
    });
    app.get('/*', (_request, reply) => reply.sendFile('index.html'));
  }

  return app;
}

function errorStatusCode(code: DomainError['code']): number {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'FACT_VERIFICATION_REQUIRED':
      return 409;
    default:
      return 503;
  }
}
