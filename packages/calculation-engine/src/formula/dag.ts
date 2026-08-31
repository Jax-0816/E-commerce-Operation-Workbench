import type { FormulaNode } from './ast.js';
import { FormulaNodeSchema, isFormulaVariableName } from './schema.js';

export const MAX_FORMULA_DEFINITIONS = 256;

export interface FormulaDefinition {
  readonly formula: FormulaNode;
  readonly key: string;
}

export function orderDependencies(
  definitions: readonly FormulaDefinition[],
): readonly FormulaDefinition[] {
  if (definitions.length > MAX_FORMULA_DEFINITIONS) {
    throw new RangeError(
      `Formula graph exceeds the maximum of ${MAX_FORMULA_DEFINITIONS} definitions.`,
    );
  }

  const definitionsByKey = new Map<string, FormulaDefinition>();
  const inputIndexByKey = new Map<string, number>();
  definitions.forEach((definition, index) => {
    if (!isFormulaVariableName(definition.key)) {
      throw new TypeError(`Invalid formula definition key: ${definition.key}`);
    }
    if (definitionsByKey.has(definition.key)) {
      throw new TypeError(`Duplicate formula definition key: ${definition.key}`);
    }
    FormulaNodeSchema.parse(definition.formula);
    definitionsByKey.set(definition.key, definition);
    inputIndexByKey.set(definition.key, index);
  });

  const dependenciesByKey = new Map<string, readonly string[]>();
  const dependentsByKey = new Map<string, string[]>();
  const remainingDependencies = new Map<string, number>();
  for (const definition of definitions) {
    const dependencies = [...collectVariables(definition.formula)].filter((name) =>
      definitionsByKey.has(name),
    );
    dependenciesByKey.set(definition.key, dependencies);
    remainingDependencies.set(definition.key, dependencies.length);
    for (const dependency of dependencies) {
      const dependents = dependentsByKey.get(dependency) ?? [];
      dependents.push(definition.key);
      dependentsByKey.set(dependency, dependents);
    }
  }

  const ready = definitions
    .filter((definition) => remainingDependencies.get(definition.key) === 0)
    .map(({ key }) => key);
  const ordered: FormulaDefinition[] = [];

  while (ready.length > 0) {
    const key = ready.shift();
    if (!key) break;
    const definition = definitionsByKey.get(key);
    if (definition) ordered.push(definition);
    for (const dependent of dependentsByKey.get(key) ?? []) {
      const remaining = (remainingDependencies.get(dependent) ?? 0) - 1;
      remainingDependencies.set(dependent, remaining);
      if (remaining === 0) insertByInputOrder(ready, dependent, inputIndexByKey);
    }
  }

  if (ordered.length !== definitions.length) {
    throw new TypeError(`Formula dependency cycle: ${findCycle(definitions, dependenciesByKey)}`);
  }
  return ordered;
}

function insertByInputOrder(
  ready: string[],
  key: string,
  inputIndexByKey: ReadonlyMap<string, number>,
): void {
  const index = inputIndexByKey.get(key) ?? Number.MAX_SAFE_INTEGER;
  const insertionPoint = ready.findIndex(
    (candidate) => (inputIndexByKey.get(candidate) ?? Number.MAX_SAFE_INTEGER) > index,
  );
  if (insertionPoint === -1) ready.push(key);
  else ready.splice(insertionPoint, 0, key);
}

function findCycle(
  definitions: readonly FormulaDefinition[],
  dependenciesByKey: ReadonlyMap<string, readonly string[]>,
): string {
  const states = new Map<string, 'visited' | 'visiting'>();
  const path: string[] = [];
  const visit = (key: string): string | undefined => {
    const state = states.get(key);
    if (state === 'visited') return undefined;
    if (state === 'visiting') {
      const cycleStart = path.indexOf(key);
      return [...path.slice(cycleStart), key].join(' -> ');
    }
    states.set(key, 'visiting');
    path.push(key);
    for (const dependency of dependenciesByKey.get(key) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    states.set(key, 'visited');
    return undefined;
  };
  for (const definition of definitions) {
    const cycle = visit(definition.key);
    if (cycle) return cycle;
  }
  return 'unknown cycle';
}

function collectVariables(formula: FormulaNode): ReadonlySet<string> {
  const variables = new Set<string>();
  const pending: FormulaNode[] = [formula];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) break;
    switch (node.type) {
      case 'literal':
        break;
      case 'variable':
        variables.add(node.name);
        break;
      case 'add':
      case 'subtract':
      case 'multiply':
      case 'divide':
        pending.push(node.right, node.left);
        break;
      case 'min':
      case 'max':
        for (let index = node.operands.length - 1; index >= 0; index -= 1) {
          const operand = node.operands[index];
          if (operand) pending.push(operand);
        }
        break;
      case 'round':
      case 'ceil':
      case 'floor':
        pending.push(node.operand);
        break;
      case 'if':
        pending.push(node.else, node.then, node.condition.right, node.condition.left);
        break;
    }
  }
  return variables;
}
