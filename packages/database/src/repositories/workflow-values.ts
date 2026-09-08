import { parseUuidV7 } from '@eaw/domain';
import {
  createWorkflowDefinition,
  type WorkflowDefinition,
  type WorkflowNodeDefinition,
  type WorkflowNodeError,
  type WorkflowNodeOutputReference,
} from '@eaw/workflow-engine';

export function workflowDefinition(value: unknown): WorkflowDefinition {
  const record = exactRecord(value, ['definitionId', 'version', 'nodes'], 'workflow definition');
  if (!Array.isArray(record.nodes)) throw invalid('workflow definition');
  const nodes = record.nodes.map((node) => workflowNodeDefinition(node));
  return createWorkflowDefinition({
    definitionId: requiredText(record.definitionId, 'workflow definition'),
    version: requiredText(record.version, 'workflow definition'),
    nodes,
  });
}

export function workflowOutput(value: unknown): WorkflowNodeOutputReference {
  const record = exactRecord(value, ['assetType', 'assetId', 'revisionNo'], 'output reference');
  return {
    assetType: requiredText(record.assetType, 'output reference'),
    assetId:
      typeof record.assetId === 'string'
        ? parseUuidV7(record.assetId)
        : invalid('output reference'),
    revisionNo: positive(record.revisionNo, 'output reference'),
  };
}

export function workflowError(value: unknown): WorkflowNodeError {
  const record = exactRecord(value, ['code', 'message'], 'workflow error');
  return {
    code: requiredText(record.code, 'workflow error'),
    message: requiredText(record.message, 'workflow error'),
  };
}

export function workflowEventPayload(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw invalid('workflow event payload');
  return value;
}

export function dependencyHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw invalid('dependency hash');
  }
  return value;
}

function workflowNodeDefinition(value: unknown): WorkflowNodeDefinition {
  const record = exactRecord(
    value,
    ['key', 'taskType', 'dependsOn', 'order'],
    'workflow node definition',
  );
  if (
    !Array.isArray(record.dependsOn) ||
    !record.dependsOn.every((item) => typeof item === 'string')
  ) {
    throw invalid('workflow node definition');
  }
  return {
    key: requiredText(record.key, 'workflow node definition'),
    taskType: requiredText(record.taskType, 'workflow node definition'),
    dependsOn: record.dependsOn,
    order: positive(record.order, 'workflow node definition'),
  };
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    throw invalid(label);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw invalid(label);
  return value as number;
}

function invalid(label: string): never {
  throw new TypeError(`Invalid ${label}.`);
}
