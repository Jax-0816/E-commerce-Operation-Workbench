import { moneyFromMinorUnits, type Money } from '../money.js';
import { divideAndRound, roundingPolicy, type RoundingPolicy } from '../rounding.js';
import type { CompareFormulaNode, FormulaNode } from './ast.js';
import { FormulaNodeSchema } from './schema.js';

interface ExactValue {
  readonly denominator: bigint;
  readonly numerator: bigint;
}

export const MAX_FORMULA_INTERMEDIATE_DIGITS = 4096;

export function evaluateFormula(
  ast: FormulaNode,
  variables: ReadonlyMap<string, Money>,
  policy: RoundingPolicy,
): Money {
  const formula = FormulaNodeSchema.parse(ast);
  let currency: string | undefined;

  const evaluate = (node: FormulaNode): ExactValue => {
    switch (node.type) {
      case 'literal':
        return exactValue(BigInt(node.numerator), BigInt(node.denominator));
      case 'variable': {
        const value = variables.get(node.name);
        if (!value) throw new ReferenceError(`Unknown formula variable: ${node.name}`);
        if (currency !== undefined && currency !== value.currency) {
          throw new TypeError(`Formula currency mismatch: ${currency} and ${value.currency}.`);
        }
        currency = value.currency;
        return exactValue(value.minorUnits, 1n);
      }
      case 'add':
        return addExact(evaluate(node.left), evaluate(node.right));
      case 'subtract':
        return subtractExact(evaluate(node.left), evaluate(node.right));
      case 'multiply':
        return multiplyExact(evaluate(node.left), evaluate(node.right));
      case 'divide':
        return divideExact(evaluate(node.left), evaluate(node.right));
      case 'min':
      case 'max': {
        const [first, ...remaining] = node.operands;
        if (!first) throw new TypeError(`${node.type} requires at least one operand.`);
        return remaining.reduce((selected, operand) => {
          const candidate = evaluate(operand);
          const comparison = compareExact(candidate, selected);
          return node.type === 'min'
            ? comparison < 0
              ? candidate
              : selected
            : comparison > 0
              ? candidate
              : selected;
        }, evaluate(first));
      }
      case 'round':
        return roundExact(evaluate(node.operand), policy);
      case 'ceil':
        return roundExact(evaluate(node.operand), roundingPolicy('ceil'));
      case 'floor':
        return roundExact(evaluate(node.operand), roundingPolicy('floor'));
      case 'if':
        return evaluate(evaluateComparison(node.condition) ? node.then : node.else);
    }
  };

  const evaluateComparison = (node: CompareFormulaNode): boolean => {
    const comparison = compareExact(evaluate(node.left), evaluate(node.right));
    switch (node.operator) {
      case 'eq':
        return comparison === 0;
      case 'ne':
        return comparison !== 0;
      case 'lt':
        return comparison < 0;
      case 'lte':
        return comparison <= 0;
      case 'gt':
        return comparison > 0;
      case 'gte':
        return comparison >= 0;
    }
  };

  const result = evaluate(formula);
  return moneyFromMinorUnits(
    divideAndRound(result.numerator, result.denominator, policy),
    currency ?? 'CNY',
  );
}

function addExact(left: ExactValue, right: ExactValue): ExactValue {
  return exactValue(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiplyExact(left: ExactValue, right: ExactValue): ExactValue {
  return exactValue(left.numerator * right.numerator, left.denominator * right.denominator);
}

function subtractExact(left: ExactValue, right: ExactValue): ExactValue {
  const numerator = left.numerator * right.denominator - right.numerator * left.denominator;
  if (numerator < 0n) throw new RangeError('Formula monetary result cannot be negative.');
  return exactValue(numerator, left.denominator * right.denominator);
}

function divideExact(left: ExactValue, right: ExactValue): ExactValue {
  if (right.numerator === 0n) throw new RangeError('Formula cannot divide by zero.');
  return exactValue(left.numerator * right.denominator, left.denominator * right.numerator);
}

function roundExact(value: ExactValue, policy: RoundingPolicy): ExactValue {
  return exactValue(divideAndRound(value.numerator, value.denominator, policy), 1n);
}

function compareExact(left: ExactValue, right: ExactValue): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function exactValue(numerator: bigint, denominator: bigint): ExactValue {
  assertExactValueBudget(numerator, denominator);
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function assertExactValueBudget(numerator: bigint, denominator: bigint): void {
  if (
    decimalDigitCount(numerator) > MAX_FORMULA_INTERMEDIATE_DIGITS ||
    decimalDigitCount(denominator) > MAX_FORMULA_INTERMEDIATE_DIGITS
  ) {
    throw new RangeError(
      `Formula exact value exceeds the ${MAX_FORMULA_INTERMEDIATE_DIGITS}-digit calculation budget.`,
    );
  }
}

function decimalDigitCount(value: bigint): number {
  return (value < 0n ? -value : value).toString().length;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}
