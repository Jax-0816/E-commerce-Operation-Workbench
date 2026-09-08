import type { OpenDatabase } from '../client.js';
import { integer, rollback } from './content-revision-values.js';

type Row = Record<string, unknown>;

const INTERRUPTION_ERROR = {
  code: 'WORKFLOW_INTERRUPTED',
  message: 'Workflow execution was interrupted by a process restart.',
} as const;

export async function recoverInterruptedWorkflows(
  database: OpenDatabase,
  now: Date,
): Promise<number> {
  const timestamp = now.getTime();
  if (!Number.isSafeInteger(timestamp)) throw new TypeError('Invalid recovery date.');
  database.sqlite.exec('BEGIN IMMEDIATE;');
  try {
    const runs = database.sqlite
      .prepare(
        "SELECT id,revision FROM workflow_runs WHERE status = 'running' ORDER BY created_at,id",
      )
      .all() as Row[];
    for (const run of runs) recoverRun(database, run, timestamp);
    database.sqlite.exec('COMMIT;');
    return runs.length;
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function recoverRun(database: OpenDatabase, run: Row, timestamp: number): void {
  const id = requiredText(run.id);
  const revision = positive(run.revision);
  const nodes = database.sqlite
    .prepare(
      "SELECT node_key,dependency_hash,claimed_at FROM workflow_nodes WHERE workflow_run_id = ? AND status = 'running' ORDER BY node_order",
    )
    .all(id) as Row[];
  for (const node of nodes) {
    const nodeKey = requiredText(node.node_key);
    const dependencyHash = requiredText(node.dependency_hash);
    const claimedAt = integer(node.claimed_at);
    const attempt = database.sqlite
      .prepare(
        'SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no FROM workflow_attempts WHERE workflow_run_id = ? AND node_key = ?',
      )
      .get(id, nodeKey) as Row;
    database.sqlite
      .prepare(
        'INSERT INTO workflow_attempts (workflow_run_id,node_key,attempt_no,dependency_hash,status,started_at,finished_at,error_json) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        nodeKey,
        positive(attempt.attempt_no),
        dependencyHash,
        'failed',
        claimedAt,
        timestamp,
        JSON.stringify(INTERRUPTION_ERROR),
      );
    database.sqlite
      .prepare(
        "UPDATE workflow_nodes SET status = 'failed', error_json = ?, claimed_at = NULL WHERE workflow_run_id = ? AND node_key = ? AND status = 'running'",
      )
      .run(JSON.stringify(INTERRUPTION_ERROR), id, nodeKey);
  }
  const updated = database.sqlite
    .prepare(
      "UPDATE workflow_runs SET status = 'interrupted', revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'running'",
    )
    .run(timestamp, id, revision);
  if (Number(updated.changes) !== 1) throw new TypeError('Workflow recovery conflict.');
  const event = database.sqlite
    .prepare(
      'SELECT COALESCE(MAX(event_sequence), 0) + 1 AS event_sequence FROM workflow_events WHERE workflow_run_id = ?',
    )
    .get(id) as Row;
  database.sqlite
    .prepare(
      'INSERT INTO workflow_events (workflow_run_id,event_sequence,event_type,run_revision,node_key,payload_json,created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      id,
      positive(event.event_sequence),
      'workflow_interrupted',
      revision + 1,
      null,
      JSON.stringify({ nodeKeys: nodes.map((node) => requiredText(node.node_key)) }),
      timestamp,
    );
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('Expected text.');
  return value;
}

function positive(value: unknown): number {
  const result = integer(value);
  if (result < 1) throw new TypeError('Expected a positive integer.');
  return result;
}
