import type { WorkflowsApplication } from '@eaw/application';
import {
  ProductWorkflowParamsSchema,
  StartWorkflowInputSchema,
  WorkflowEventsQuerySchema,
  WorkflowNodeParamsSchema,
  WorkflowRevisionInputSchema,
  WorkflowRunParamsSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

type WorkflowEvent = Parameters<WorkflowsApplication['subscribe']>[2] extends (
  event: infer Event,
) => void
  ? Event
  : never;

export function registerWorkflowRoutes(
  app: FastifyInstance,
  workflows: WorkflowsApplication | undefined,
): void {
  const required = (): WorkflowsApplication => {
    if (!workflows) throw new DomainError('CAPABILITY_UNAVAILABLE', 'Workflows are unavailable.');
    return workflows;
  };

  app.post('/api/v1/products/:productId/workflows/preflight', async (request) => {
    const { productId } = parse(ProductWorkflowParamsSchema.safeParse(request.params));
    const { platformId } = parse(StartWorkflowInputSchema.safeParse(request.body));
    return required().preflight(productId, platformId);
  });

  app.post('/api/v1/products/:productId/workflows', async (request, reply) => {
    const { productId } = parse(ProductWorkflowParamsSchema.safeParse(request.params));
    const { platformId } = parse(StartWorkflowInputSchema.safeParse(request.body));
    return reply.code(202).send(runResponse(await required().start(productId, platformId)));
  });

  app.get('/api/v1/products/:productId/workflows', async (request) => {
    const { productId } = parse(ProductWorkflowParamsSchema.safeParse(request.params));
    return { items: (await required().list(productId)).map(runResponse) };
  });

  app.get('/api/v1/workflows/:workflowRunId', async (request) => {
    const { workflowRunId } = parse(WorkflowRunParamsSchema.safeParse(request.params));
    return runResponse(await required().get(workflowRunId));
  });

  app.post('/api/v1/workflows/:workflowRunId/resume', async (request, reply) => {
    const { workflowRunId } = parse(WorkflowRunParamsSchema.safeParse(request.params));
    const { expectedRevision } = parse(WorkflowRevisionInputSchema.safeParse(request.body));
    return reply
      .code(202)
      .send(runResponse(await required().resume(workflowRunId, expectedRevision)));
  });

  app.post('/api/v1/workflows/:workflowRunId/nodes/:nodeKey/retry', async (request, reply) => {
    const { workflowRunId, nodeKey } = parse(
      WorkflowNodeParamsSchema.safeParse(request.params),
    );
    const { expectedRevision } = parse(WorkflowRevisionInputSchema.safeParse(request.body));
    return reply
      .code(202)
      .send(runResponse(await required().retryNode(workflowRunId, nodeKey, expectedRevision)));
  });

  app.post('/api/v1/workflows/:workflowRunId/cancel', async (request) => {
    const { workflowRunId } = parse(WorkflowRunParamsSchema.safeParse(request.params));
    const { expectedRevision } = parse(WorkflowRevisionInputSchema.safeParse(request.body));
    return runResponse(await required().cancel(workflowRunId, expectedRevision));
  });

  registerWorkflowEventRoute(app, workflows);
}

export function registerWorkflowEventRoute(
  app: FastifyInstance,
  workflows: WorkflowsApplication | undefined,
  heartbeatMs = 15_000,
): void {
  app.get('/api/v1/workflows/:workflowRunId/events', async (request, reply) => {
    const { workflowRunId } = parse(WorkflowRunParamsSchema.safeParse(request.params));
    const { afterSequence } = parse(WorkflowEventsQuerySchema.safeParse(request.query));
    if (!workflows) throw new DomainError('CAPABILITY_UNAVAILABLE', 'Workflows are unavailable.');

    const pending: WorkflowEvent[] = [];
    let ready = false;
    let closed = false;
    const subscription: {
      unsubscribe?: () => void;
      heartbeat?: ReturnType<typeof setInterval>;
    } = {};
    const deliver = (event: WorkflowEvent): void => {
      if (closed) return;
      if (!ready) pending.push(event);
      else reply.raw.write(encodeEvent(event));
    };
    reply.raw.once('close', () => {
      closed = true;
      if (subscription.heartbeat) clearInterval(subscription.heartbeat);
      subscription.unsubscribe?.();
    });
    subscription.unsubscribe = await workflows.subscribe(workflowRunId, afterSequence, deliver);
    if (closed) {
      subscription.unsubscribe();
      return;
    }

    reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('cache-control', 'no-cache');
    reply.raw.setHeader('connection', 'keep-alive');
    reply.hijack();
    ready = true;
    for (const event of pending) reply.raw.write(encodeEvent(event));
    subscription.heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(': heartbeat\n\n');
    }, heartbeatMs);
    subscription.heartbeat.unref();
  });
}

function runResponse(run: Awaited<ReturnType<WorkflowsApplication['get']>>) {
  return {
    ...run,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function encodeEvent(event: WorkflowEvent): string {
  const data = { ...event, createdAt: event.createdAt.toISOString() };
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parse<T>(result: { readonly success: true; readonly data: T } | { readonly success: false }): T {
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Workflow request is invalid.');
  return result.data;
}
