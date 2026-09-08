import {
  createWorkflowDefinition,
  type CreateWorkflowRunInput,
  type WorkflowEvent,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowNodeStatus,
  type WorkflowRun,
  type WorkflowRunStatus,
} from '@eaw/workflow-engine';
import type { UuidV7 } from '@eaw/domain';

import type { OpenDatabase } from '../client.js';
import { integer, json, platform, rollback, uuid } from './content-revision-values.js';

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
    const definition = createWorkflowDefinition(json(row.definition_json) as WorkflowDefinition);
    const nodes = this.database.sqlite
      .prepare('SELECT * FROM workflow_nodes WHERE workflow_run_id = ? ORDER BY node_order')
      .all(id) as Row[];
    if (nodes.length !== definition.nodes.length)
      throw new TypeError('Workflow nodes are invalid.');
    return {
      id: uuid(row.id),
      productId: uuid(row.product_id),
      platformId: platform(row.platform_id),
      definition,
      status: runStatus(row.status),
      revision: positive(row.revision),
      cancellationRequested: booleanInteger(row.cancellation_requested),
      nodes: nodes.map(toNode),
      createdAt: validDate(row.created_at),
      updatedAt: validDate(row.updated_at),
    };
  }

  async listEvents(id: UuidV7, afterSequence: number): Promise<readonly WorkflowEvent[]> {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0)
      throw new TypeError('Invalid sequence.');
    return (
      this.database.sqlite
        .prepare(
          'SELECT * FROM workflow_events WHERE workflow_run_id = ? AND event_sequence > ? ORDER BY event_sequence',
        )
        .all(id, afterSequence) as Row[]
    ).map(toEvent);
  }
}

function toNode(row: Row): WorkflowNode {
  return {
    key: text(row.node_key),
    taskType: text(row.task_type),
    status: nodeStatus(row.status),
    dependencyHash: nullableText(row.dependency_hash),
    output: row.output_json === null ? null : (json(row.output_json) as WorkflowNode['output']),
    error: row.error_json === null ? null : (json(row.error_json) as WorkflowNode['error']),
  };
}

function toEvent(row: Row): WorkflowEvent {
  return {
    workflowRunId: uuid(row.workflow_run_id),
    sequence: positive(row.event_sequence),
    type: text(row.event_type),
    runRevision: positive(row.run_revision),
    nodeKey: nullableText(row.node_key),
    payload: json(row.payload_json) as Record<string, unknown>,
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

function validDate(value: unknown): Date {
  const date = new Date(integer(value));
  if (!Number.isSafeInteger(date.getTime())) throw new TypeError('Invalid date.');
  return date;
}
