import { EventEmitter } from 'node:events';

import type { WorkflowsApplication } from '@eaw/application';
import { DomainError, createUuidV7 } from '@eaw/domain';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';
import { registerWorkflowEventRoute } from './workflows.js';

describe('workflow event stream', () => {
  it('streams durable replay then live events with persistent IDs and cleans up', async () => {
    const workflowRunId = createUuidV7();
    const seenCursors: number[] = [];
    let unsubscribed = 0;
    const workflows = application({
      async subscribe(id, afterSequence, listener) {
        expect(id).toBe(workflowRunId);
        seenCursors.push(afterSequence);
        listener(event(workflowRunId, 2, 'node_completed'));
        setTimeout(() => listener(event(workflowRunId, 3, 'run_completed')), 5);
        return () => { unsubscribed += 1; };
      },
    });
    let handler: ((request: unknown, reply: unknown) => Promise<void>) | undefined;
    registerWorkflowEventRoute(
      { get: (_path: string, route: typeof handler) => { handler = route; } } as never,
      workflows,
      1,
    );
    const raw = Object.assign(new EventEmitter(), {
      headers: {} as Record<string, string>,
      body: '',
      setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; },
      write(chunk: string) { this.body += chunk; return true; },
    });
    const reply = { raw, hijack: () => undefined };
    await handler!({ params: { workflowRunId }, query: { afterSequence: '1' } }, reply);
    await eventually(() => expect(raw.body).toContain('id: 3'));
    await eventually(() => expect(raw.body).toContain(': heartbeat\n\n'));

    expect(raw.headers['content-type']).toContain('text/event-stream');
    expect(raw.headers['cache-control']).toBe('no-cache');
    expect(raw.body).toContain('id: 2\nevent: node_completed\n');
    expect(raw.body).toContain('id: 3\nevent: run_completed\n');
    expect(raw.body).toContain(`"workflowRunId":"${workflowRunId}"`);
    expect(seenCursors).toEqual([1]);
    raw.emit('close');
    await eventually(() => expect(unsubscribed).toBe(1));
  });

  it('rejects invalid cursors and unavailable workflow services before opening a stream', async () => {
    const runId = createUuidV7();
    const unavailable = buildApp(createAppContext({}));
    expect((await unavailable.inject({ method: 'GET', url: `/api/v1/workflows/${runId}/events` })).statusCode).toBe(503);
    await unavailable.close();

    let subscriptions = 0;
    const app = buildApp(createAppContext({ workflows: application({
      subscribe: async () => { subscriptions += 1; return () => undefined; },
    }) }));
    expect((await app.inject({ method: 'GET', url: `/api/v1/workflows/${runId}/events?afterSequence=-1` })).statusCode).toBe(400);
    expect(subscriptions).toBe(0);
    await app.close();
  });
});

function application(overrides: Partial<WorkflowsApplication>): WorkflowsApplication {
  const unavailable = async () => { throw new DomainError('CAPABILITY_UNAVAILABLE', 'not configured'); };
  return {
    preflight: unavailable, start: unavailable, list: unavailable, get: unavailable,
    resume: unavailable, retryNode: unavailable, cancel: unavailable, listEvents: unavailable,
    subscribe: unavailable,
    ...overrides,
  } as WorkflowsApplication;
}

function event(workflowRunId: ReturnType<typeof createUuidV7>, sequence: number, type: string) {
  return {
    workflowRunId, sequence, type, runRevision: sequence, nodeKey: null,
    payload: { sequence }, createdAt: new Date('2026-09-08T09:00:00.000Z'),
  };
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { assertion(); return; } catch { await new Promise((resolve) => setTimeout(resolve, 5)); }
  }
  assertion();
}
