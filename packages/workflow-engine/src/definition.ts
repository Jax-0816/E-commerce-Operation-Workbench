import { DomainError } from '@eaw/domain';

import type { WorkflowDefinition, WorkflowNodeDefinition } from './types.js';

const IDENTIFIER = /^[a-z][a-z0-9_]{0,63}$/u;
const VERSION = /^\d+\.\d+\.\d+$/u;
const MAX_NODES = 50;

export function createWorkflowDefinition(input: WorkflowDefinition): WorkflowDefinition {
  if (!IDENTIFIER.test(input.definitionId) || !VERSION.test(input.version)) {
    throw invalid('Workflow identity is invalid.');
  }
  if (input.nodes.length === 0) throw invalid('Workflow definition cannot be empty.');
  if (input.nodes.length > MAX_NODES) throw invalid('Workflow definition cannot exceed 50 nodes.');

  const nodes = [...input.nodes].sort((left, right) => left.order - right.order);
  const keys = new Set<string>();
  const orders = new Set<number>();
  for (const node of nodes) validateNode(node, keys, orders);
  if (nodes.some(({ order }, index) => order !== index + 1)) {
    throw invalid('Workflow node order is invalid.');
  }
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (dependency === node.key) throw invalid('A workflow node cannot depend on itself.');
      if (!keys.has(dependency)) throw invalid('Workflow dependency is unknown.');
    }
  }
  assertAcyclic(nodes);

  return deepFreeze(structuredClone({ ...input, nodes }));
}

export const contentWorkflowDefinition = createWorkflowDefinition({
  definitionId: 'product_content',
  version: '1.0.0',
  nodes: [
    { key: 'competitor_analysis', taskType: 'competitor_analysis', dependsOn: [], order: 1 },
    {
      key: 'market_insight',
      taskType: 'market_insight',
      dependsOn: ['competitor_analysis'],
      order: 2,
    },
    {
      key: 'selling_points',
      taskType: 'selling_point_set',
      dependsOn: ['market_insight'],
      order: 3,
    },
    { key: 'titles', taskType: 'title_generation', dependsOn: ['selling_points'], order: 4 },
    { key: 'creative', taskType: 'creative_plan', dependsOn: ['titles'], order: 5 },
    { key: 'detail_page', taskType: 'detail_page', dependsOn: ['titles'], order: 6 },
  ],
});

function validateNode(node: WorkflowNodeDefinition, keys: Set<string>, orders: Set<number>): void {
  if (
    !IDENTIFIER.test(node.key) ||
    !IDENTIFIER.test(node.taskType) ||
    !Number.isSafeInteger(node.order) ||
    node.order < 1 ||
    node.dependsOn.length > MAX_NODES ||
    node.dependsOn.some((dependency) => !IDENTIFIER.test(dependency))
  ) {
    throw invalid('Workflow node is invalid.');
  }
  if (keys.has(node.key) || orders.has(node.order)) {
    throw invalid('Workflow node keys and orders must be unique.');
  }
  if (new Set(node.dependsOn).size !== node.dependsOn.length) {
    throw invalid('Workflow dependencies must be unique.');
  }
  keys.add(node.key);
  orders.add(node.order);
}

function assertAcyclic(nodes: readonly WorkflowNodeDefinition[]): void {
  const remaining = new Map(nodes.map((node) => [node.key, new Set(node.dependsOn)]));
  while (remaining.size > 0) {
    const ready = [...remaining].filter(([, dependencies]) => dependencies.size === 0);
    if (ready.length === 0) throw invalid('Workflow definition contains a cycle.');
    for (const [key] of ready) {
      remaining.delete(key);
      for (const dependencies of remaining.values()) dependencies.delete(key);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function invalid(message: string): DomainError {
  return new DomainError('VALIDATION_ERROR', message);
}
