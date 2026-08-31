import { describe, expect, it } from 'vitest';

import type { FormulaNode } from './ast.js';
import { orderDependencies, type FormulaDefinition } from './dag.js';

describe('formula dependency DAG', () => {
  it('orders transitive formula dependencies before their consumers', () => {
    const definitions = [
      definition('A', add(variable('B'), variable('external_input'))),
      definition('B', variable('C')),
      definition('C', literal('1')),
    ];

    expect(orderDependencies(definitions).map(({ key }) => key)).toEqual(['C', 'B', 'A']);
  });

  it('preserves input order for independent definitions and does not mutate the input', () => {
    const definitions = [definition('B', literal('2')), definition('A', variable('external'))];
    const snapshot = [...definitions];

    expect(orderDependencies(definitions).map(({ key }) => key)).toEqual(['B', 'A']);
    expect(definitions).toEqual(snapshot);
  });

  it('uses original input order when multiple definitions are ready', () => {
    const definitions = [
      definition('A', variable('D')),
      definition('B', variable('D')),
      definition('C', literal('1')),
      definition('D', literal('1')),
    ];

    expect(orderDependencies(definitions).map(({ key }) => key)).toEqual(['C', 'D', 'A', 'B']);
  });

  it('rejects duplicate definition keys', () => {
    const definitions = [definition('fee', literal('1')), definition('fee', literal('2'))];

    expect(() => orderDependencies(definitions)).toThrow(/duplicate.*fee/i);
  });

  it('rejects definition keys that cannot be referenced by formulas', () => {
    expect(() => orderDependencies([definition('bad key', literal('1'))])).toThrow(/key/i);
  });

  it('rejects an excessive number of definitions before graph traversal', () => {
    const definitions = Array.from({ length: 300 }, (_, index) =>
      definition(`node_${index}`, literal('1')),
    );

    expect(() => orderDependencies(definitions)).toThrow(/definitions/i);
  });

  it('reports the complete cycle path', () => {
    const definitions = [
      definition('A', variable('B')),
      definition('B', variable('C')),
      definition('C', variable('A')),
    ];

    expect(() => orderDependencies(definitions)).toThrow(/A.*B.*C.*A/u);
  });

  it('orders a deterministic chain across the supported node range', () => {
    const definitions: FormulaDefinition[] = [];
    for (let index = 0; index < 50; index += 1) {
      definitions.push(
        definition(`node_${index}`, index === 49 ? literal('1') : variable(`node_${index + 1}`)),
      );
    }

    expect(orderDependencies(definitions).map(({ key }) => key)).toEqual(
      Array.from({ length: 50 }, (_, index) => `node_${49 - index}`),
    );
  });
});

function definition(key: string, formula: FormulaNode): FormulaDefinition {
  return { key, formula };
}

function literal(numerator: string): FormulaNode {
  return { type: 'literal', numerator, denominator: '1' };
}

function variable(name: string): FormulaNode {
  return { type: 'variable', name };
}

function add(left: FormulaNode, right: FormulaNode): FormulaNode {
  return { type: 'add', left, right };
}
