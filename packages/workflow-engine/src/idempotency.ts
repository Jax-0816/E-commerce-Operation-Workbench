import { DomainError, parseUuidV7, type UuidV7 } from '@eaw/domain';

declare const idempotencyKeyBrand: unique symbol;
export type WorkflowIdempotencyKey = string & {
  readonly [idempotencyKeyBrand]: 'WorkflowIdempotencyKey';
};

const NODE_KEY = /^[a-z][a-z0-9_]{0,63}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

export function createIdempotencyKey(
  runId: UuidV7,
  nodeKey: string,
  dependencyHash: string,
): WorkflowIdempotencyKey {
  try {
    parseUuidV7(runId);
  } catch {
    throw invalid();
  }
  if (!NODE_KEY.test(nodeKey) || !SHA256.test(dependencyHash)) throw invalid();
  return `${runId}:${nodeKey}:${dependencyHash}` as WorkflowIdempotencyKey;
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Workflow idempotency identity is invalid.');
}
