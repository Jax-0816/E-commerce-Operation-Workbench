import {
  createIdempotencyKey,
  createWorkflowDefinition,
  type CreateWorkflowRunInput,
  type WorkflowEvent,
  type WorkflowNodeDefinition,
  type WorkflowNode,
  type WorkflowNodeStatus,
  type WorkflowRun,
  type WorkflowRunStatus,
} from '@eaw/workflow-engine';
import { DomainError, type UuidV7 } from '@eaw/domain';

import type { OpenDatabase } from '../client.js';
import { integer, json, platform, rollback, uuid } from './content-revision-values.js';
import {
  dependencyHash,
  workflowDefinition,
  workflowError,
  workflowEventPayload,
  workflowOutput,
} from './workflow-values.js';

type Row = Record<string, unknown>;

export class SqliteWorkflowRepository {
  constructor(private readonly database: OpenDatabase) {}

  async create(input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    const definition = createWorkflowDefinition(input.definition);
    if (!Number.isSafeInteger(input.createdAt.getTime())) throw new TypeError('Invalid date.');
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      this.database.sqlite
        .prepare(
          'INSERT INTO workflow_runs (id,product_id,platform_id,definition_json,status,revision,cancellation_requested,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(
          input.id,
          input.productId,
          input.platformId,
          JSON.stringify(definition),
          'not_started',
          1,
          0,
          input.createdAt.getTime(),
          input.createdAt.getTime(),
        );
      const insertNode = this.database.sqlite.prepare(
        'INSERT INTO workflow_nodes (workflow_run_id,node_key,task_type,node_order,status,dependency_hash,output_json,error_json) VALUES (?,?,?,?,?,?,?,?)',
      );
      for (const node of definition.nodes) {
        insertNode.run(
          input.id,
          node.key,
          node.taskType,
          node.order,
          'not_started',
          null,
          null,
          null,
        );
      }
      this.database.sqlite
        .prepare(
          'INSERT INTO workflow_events (workflow_run_id,event_sequence,event_type,run_revision,node_key,payload_json,created_at) VALUES (?,?,?,?,?,?,?)',
        )
        .run(input.id, 1, 'workflow_created', 1, null, '{}', input.createdAt.getTime());
      this.database.sqlite.exec('COMMIT;');
    } catch (error) {
      rollback(this.database);
      throw error;
    }
    return (await this.findById(input.id))!;
  }

  async findById(id: UuidV7): Promise<WorkflowRun | undefined> {
    const row = this.database.sqlite.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id) as
      Row | undefined;
    if (!row) return undefined;
    const definition = workflowDefinition(json(row.definition_json));
    const nodes = this.database.sqlite
      .prepare('SELECT * FROM workflow_nodes WHERE workflow_run_id = ? ORDER BY node_order')
      .all(id) as Row[];
    if (nodes.length !== definition.nodes.length)
      throw new TypeError('Workflow nodes are invalid.');
    const parsedNodes = nodes.map((node, index) => toNode(node, definition.nodes[index]!));
    return {
      id: uuid(row.id),
      productId: uuid(row.product_id),
      platformId: platform(row.platform_id),
      definition,
      status: runStatus(row.status),
      revision: positive(row.revision),
      cancellationRequested: booleanInteger(row.cancellation_requested),
      nodes: parsedNodes,
      createdAt: validDate(row.created_at),
      updatedAt: validDate(row.updated_at),
    };
  }

  async listEvents(id: UuidV7, afterSequence: number): Promise<readonly WorkflowEvent[]> {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0)
      throw new TypeError('Invalid sequence.');
    const events = (
      this.database.sqlite
        .prepare('SELECT * FROM workflow_events WHERE workflow_run_id = ? ORDER BY event_sequence')
        .all(id) as Row[]
    ).map(toEvent);
    if (events.some(({ sequence }, index) => sequence !== index + 1)) {
      throw new TypeError('Workflow event sequence is not contiguous.');
    }
    return events.filter(({ sequence }) => sequence > afterSequence);
  }

  async markRunning(id: UuidV7, expectedRevision: number): Promise<WorkflowRun> {
    return this.transition(id, expectedRevision, 'workflow_started', null, {}, ({ status }) => {
      if (!['not_started', 'failed', 'interrupted'].includes(String(status))) throw conflict();
      return 'running';
    });
  }

  async markNodeStale(
    id: UuidV7,
    nodeKey: string,
    dependencyHash: string,
    expectedRevision: number,
  ): Promise<WorkflowRun> {
    createIdempotencyKey(id, nodeKey, dependencyHash);
    return this.transition(
      id,
      expectedRevision,
      'node_stale',
      nodeKey,
      { dependencyHash },
      ({ status }, now) => {
        if (status !== 'running') throw conflict();
        const node = this.requiredNode(id, nodeKey);
        if (!['completed', 'needs_review'].includes(String(node.status))) throw conflict();
        this.database.sqlite
          .prepare(
            "UPDATE workflow_nodes SET status = 'stale', dependency_hash = ?, error_json = NULL, claimed_at = NULL WHERE workflow_run_id = ? AND node_key = ?",
          )
          .run(dependencyHash, id, nodeKey);
        void now;
        return 'running';
      },
    );
  }

  async claimNode(
    id: UuidV7,
    nodeKey: string,
    dependencyHash: string,
    expectedRevision: number,
  ): Promise<WorkflowRun> {
    createIdempotencyKey(id, nodeKey, dependencyHash);
    return this.transition(
      id,
      expectedRevision,
      'node_claimed',
      nodeKey,
      { dependencyHash },
      ({ status }, now) => {
        if (status !== 'running') throw conflict();
        const node = this.requiredNode(id, nodeKey);
        if (!['not_started', 'failed', 'stale'].includes(String(node.status))) throw conflict();
        this.database.sqlite
          .prepare(
            "UPDATE workflow_nodes SET status = 'running', dependency_hash = ?, error_json = NULL, claimed_at = ? WHERE workflow_run_id = ? AND node_key = ?",
          )
          .run(dependencyHash, now, id, nodeKey);
        return 'running';
      },
    );
  }

  async completeNode(
    id: UuidV7,
    nodeKey: string,
    result: import('@eaw/workflow-engine').WorkflowNodeResult,
    expectedRevision: number,
  ): Promise<WorkflowRun> {
    return this.transition(
      id,
      expectedRevision,
      'node_completed',
      nodeKey,
      { status: result.status, output: result.output },
      ({ status }, now) => {
        if (status !== 'running') throw conflict();
        const node = this.requiredNode(id, nodeKey);
        if (node.status !== 'running' || typeof node.dependency_hash !== 'string') throw conflict();
        this.insertAttempt(
          id,
          nodeKey,
          node.dependency_hash,
          result.status,
          node.claimed_at,
          now,
          null,
        );
        this.database.sqlite
          .prepare(
            'UPDATE workflow_nodes SET status = ?, output_json = ?, error_json = NULL, claimed_at = NULL WHERE workflow_run_id = ? AND node_key = ?',
          )
          .run(result.status, JSON.stringify(result.output), id, nodeKey);
        return 'running';
      },
    );
  }

  async failNode(
    id: UuidV7,
    nodeKey: string,
    error: import('@eaw/workflow-engine').WorkflowNodeError,
    expectedRevision: number,
  ): Promise<WorkflowRun> {
    return this.transition(
      id,
      expectedRevision,
      'node_failed',
      nodeKey,
      { error },
      ({ status }, now) => {
        if (status !== 'running') throw conflict();
        const node = this.requiredNode(id, nodeKey);
        if (node.status === 'running' && typeof node.dependency_hash === 'string') {
          this.insertAttempt(
            id,
            nodeKey,
            node.dependency_hash,
            'failed',
            node.claimed_at,
            now,
            error,
          );
        } else if (!['not_started', 'failed', 'stale'].includes(String(node.status))) {
          throw conflict();
        }
        this.database.sqlite
          .prepare(
            "UPDATE workflow_nodes SET status = 'failed', error_json = ?, claimed_at = NULL WHERE workflow_run_id = ? AND node_key = ?",
          )
          .run(JSON.stringify(error), id, nodeKey);
        return 'failed';
      },
    );
  }

  async completeRun(id: UuidV7, expectedRevision: number): Promise<WorkflowRun> {
    return this.transition(id, expectedRevision, 'workflow_completed', null, {}, ({ status }) => {
      if (status !== 'running') throw conflict();
      const incomplete = this.database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM workflow_nodes WHERE workflow_run_id = ? AND status NOT IN ('completed','locked','needs_review')",
        )
        .get(id) as Row;
      if (integer(incomplete.count) !== 0) throw conflict();
      return 'completed';
    });
  }

  async cancelRun(id: UuidV7, expectedRevision: number): Promise<WorkflowRun> {
    return this.transition(id, expectedRevision, 'workflow_cancelled', null, {}, ({ status }) => {
      if (['completed', 'cancelled'].includes(String(status))) throw conflict();
      this.database.sqlite
        .prepare(
          "UPDATE workflow_nodes SET status = 'cancelled', claimed_at = NULL WHERE workflow_run_id = ? AND status NOT IN ('completed','locked','needs_review')",
        )
        .run(id);
      return 'cancelled';
    });
  }

  private async transition(
    id: UuidV7,
    expectedRevision: number,
    eventType: string,
    nodeKey: string | null,
    payload: Readonly<Record<string, unknown>>,
    change: (run: Row, now: number) => WorkflowRunStatus,
  ): Promise<WorkflowRun> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw conflict();
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const current = this.database.sqlite
        .prepare('SELECT revision,status FROM workflow_runs WHERE id = ?')
        .get(id) as Row | undefined;
      if (!current) throw new DomainError('NOT_FOUND', 'Workflow run was not found.');
      if (integer(current.revision) !== expectedRevision) throw conflict();
      const now = Date.now();
      const status = change(current, now);
      const updated = this.database.sqlite
        .prepare(
          'UPDATE workflow_runs SET status = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?',
        )
        .run(status, now, id, expectedRevision);
      if (Number(updated.changes) !== 1) throw conflict();
      const sequence = this.nextEventSequence(id);
      this.database.sqlite
        .prepare(
          'INSERT INTO workflow_events (workflow_run_id,event_sequence,event_type,run_revision,node_key,payload_json,created_at) VALUES (?,?,?,?,?,?,?)',
        )
        .run(id, sequence, eventType, expectedRevision + 1, nodeKey, JSON.stringify(payload), now);
      this.database.sqlite.exec('COMMIT;');
    } catch (error) {
      rollback(this.database);
      throw error;
    }
    return (await this.findById(id))!;
  }

  private requiredNode(id: UuidV7, nodeKey: string): Row {
    const node = this.database.sqlite
      .prepare('SELECT * FROM workflow_nodes WHERE workflow_run_id = ? AND node_key = ?')
      .get(id, nodeKey) as Row | undefined;
    if (!node) throw new DomainError('NOT_FOUND', 'Workflow node was not found.');
    return node;
  }

  private insertAttempt(
    id: UuidV7,
    nodeKey: string,
    dependencyHash: string,
    status: 'completed' | 'locked' | 'needs_review' | 'failed',
    claimedAt: unknown,
    now: number,
    error: import('@eaw/workflow-engine').WorkflowNodeError | null,
  ): void {
    const row = this.database.sqlite
      .prepare(
        'SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no FROM workflow_attempts WHERE workflow_run_id = ? AND node_key = ?',
      )
      .get(id, nodeKey) as Row;
    this.database.sqlite
      .prepare(
        'INSERT INTO workflow_attempts (workflow_run_id,node_key,attempt_no,dependency_hash,status,started_at,finished_at,error_json) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        nodeKey,
        positive(row.attempt_no),
        dependencyHash,
        status === 'failed' ? 'failed' : 'completed',
        claimedAt === null ? now : integer(claimedAt),
        now,
        error === null ? null : JSON.stringify(error),
      );
  }

  private nextEventSequence(id: UuidV7): number {
    const row = this.database.sqlite
      .prepare(
        'SELECT COALESCE(MAX(event_sequence), 0) + 1 AS event_sequence FROM workflow_events WHERE workflow_run_id = ?',
      )
      .get(id) as Row;
    return positive(row.event_sequence);
  }
}

function toNode(row: Row, definition: WorkflowNodeDefinition): WorkflowNode {
  if (
    text(row.node_key) !== definition.key ||
    text(row.task_type) !== definition.taskType ||
    positive(row.node_order) !== definition.order
  ) {
    throw new TypeError('Workflow node does not match its definition.');
  }
  const status = nodeStatus(row.status);
  const hash = row.dependency_hash === null ? null : dependencyHash(row.dependency_hash);
  const output = row.output_json === null ? null : workflowOutput(json(row.output_json));
  const error = row.error_json === null ? null : workflowError(json(row.error_json));
  validateNodeState(status, hash, output, error);
  return {
    key: text(row.node_key),
    taskType: text(row.task_type),
    status,
    dependencyHash: hash,
    output,
    error,
  };
}

function toEvent(row: Row): WorkflowEvent {
  return {
    workflowRunId: uuid(row.workflow_run_id),
    sequence: positive(row.event_sequence),
    type: text(row.event_type),
    runRevision: positive(row.run_revision),
    nodeKey: nullableText(row.node_key),
    payload: workflowEventPayload(json(row.payload_json)),
    createdAt: validDate(row.created_at),
  };
}

function runStatus(value: unknown): WorkflowRunStatus {
  if (
    !['not_started', 'running', 'completed', 'failed', 'interrupted', 'cancelled'].includes(
      String(value),
    )
  )
    throw new TypeError('Invalid workflow status.');
  return value as WorkflowRunStatus;
}

function nodeStatus(value: unknown): WorkflowNodeStatus {
  if (
    ![
      'not_started',
      'running',
      'completed',
      'failed',
      'stale',
      'locked',
      'needs_review',
      'cancelled',
    ].includes(String(value))
  )
    throw new TypeError('Invalid workflow node status.');
  return value as WorkflowNodeStatus;
}

function positive(value: unknown): number {
  const result = integer(value);
  if (result < 1) throw new TypeError('Expected a positive integer.');
  return result;
}

function booleanInteger(value: unknown): boolean {
  const result = integer(value);
  if (result !== 0 && result !== 1) throw new TypeError('Invalid boolean integer.');
  return result === 1;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('Expected text.');
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function validateNodeState(
  status: WorkflowNodeStatus,
  hash: string | null,
  output: WorkflowNode['output'],
  error: WorkflowNode['error'],
): void {
  if (status === 'not_started' && (hash !== null || output !== null || error !== null)) {
    throw new TypeError('Invalid not-started workflow node state.');
  }
  if (status === 'running' && (hash === null || output !== null || error !== null)) {
    throw new TypeError('Invalid running workflow node state.');
  }
  if (
    ['completed', 'locked', 'needs_review', 'stale'].includes(status) &&
    (hash === null || output === null || error !== null)
  ) {
    throw new TypeError('Invalid reusable workflow node state.');
  }
  if (status === 'failed' && error === null) {
    throw new TypeError('Invalid failed workflow node state.');
  }
}

function validDate(value: unknown): Date {
  const date = new Date(integer(value));
  if (!Number.isSafeInteger(date.getTime())) throw new TypeError('Invalid date.');
  return date;
}

function conflict(): DomainError {
  return new DomainError('CONFLICT', 'Workflow revision or state conflict.');
}
