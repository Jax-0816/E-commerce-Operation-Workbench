import { describe, expect, it } from 'vitest';

import { roundingPolicy } from '../rounding.js';
import type { FormulaNode } from './ast.js';
import { orderDependencies, type FormulaDefinition } from './dag.js';
import { evaluateFormula } from './evaluator.js';

describe('formula properties', () => {
  it('evaluates equivalent rational representations identically over a deterministic range', () => {
    for (let numerator = 0; numerator <= 20; numerator += 1) {
      for (let denominator = 1; denominator <= 10; denominator += 1) {
        for (let scale = 1; scale <= 5; scale += 1) {
          const canonical = evaluateFormula(
            literal(String(numerator), String(denominator)),
            new Map(),
            roundingPolicy('half-even'),
          );
          const scaled = evaluateFormula(
            literal(String(numerator * scale), String(denominator * scale)),
            new Map(),
            roundingPolicy('half-even'),
          );
          expect(scaled).toEqual(canonical);
        }
      }
    }
  });

  it('always places generated DAG dependencies before their consumers', () => {
    for (let size = 2; size <= 40; size += 1) {
      const definitions: FormulaDefinition[] = Array.from({ length: size }, (_, offset) => {
        const index = size - offset - 1;
        return {
          key: `node_${index}`,
          formula: index === 0 ? literal('1') : variable(`node_${Math.floor((index - 1) / 2)}`),
        };
      });
      const ordered = orderDependencies(definitions);
      const outputIndex = new Map(ordered.map(({ key }, index) => [key, index]));

      for (let index = 1; index < size; index += 1) {
        const dependency = `node_${Math.floor((index - 1) / 2)}`;
        expect(outputIndex.get(dependency)).toBeLessThan(outputIndex.get(`node_${index}`) ?? -1);
      }
    }
  });
});

function literal(numerator: string, denominator = '1'): FormulaNode {
  return { type: 'literal', numerator, denominator };
}

function variable(name: string): FormulaNode {
  return { type: 'variable', name };
}
