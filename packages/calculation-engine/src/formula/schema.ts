import { z } from 'zod';

import type { FormulaNode } from './ast.js';

export const MAX_FORMULA_DEPTH = 32;
export const MAX_FORMULA_NODES = 256;
export const MAX_FORMULA_INTEGER_DIGITS = 128;

const EXACT_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/u;
const VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;

const exactIntegerSchema = z
  .string()
  .max(
    MAX_FORMULA_INTEGER_DIGITS,
    `Exact integers may contain at most ${MAX_FORMULA_INTEGER_DIGITS} digits.`,
  )
  .regex(EXACT_INTEGER_PATTERN, 'Exact integers must be non-negative decimal integer strings.');

const FormulaValueSchema: z.ZodType<FormulaNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('literal'),
      numerator: exactIntegerSchema,
      denominator: exactIntegerSchema.refine((value) => value !== '0', {
        message: 'Formula literal denominator must be positive.',
      }),
    }),
    z.strictObject({
      type: z.literal('variable'),
      name: z.string().regex(VARIABLE_NAME_PATTERN, 'Formula variable name is invalid.'),
    }),
    binarySchema('add'),
    binarySchema('subtract'),
    binarySchema('multiply'),
    binarySchema('divide'),
    aggregateSchema('min'),
    aggregateSchema('max'),
    unarySchema('round'),
    unarySchema('ceil'),
    unarySchema('floor'),
    z.strictObject({
      type: z.literal('if'),
      condition: z.strictObject({
        type: z.literal('compare'),
        operator: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte'], {
          error: 'An if condition must use a whitelisted compare operator.',
        }),
        left: FormulaValueSchema,
        right: FormulaValueSchema,
      }),
      then: FormulaValueSchema,
      else: FormulaValueSchema,
    }),
  ]),
);

const SafeFormulaInputSchema = z.unknown().superRefine((value, context) => {
  const error = validateSafeStructure(value);
  if (error) context.addIssue({ code: 'custom', message: error });
});

export const FormulaNodeSchema: z.ZodType<FormulaNode> =
  SafeFormulaInputSchema.pipe(FormulaValueSchema);

export function isFormulaVariableName(value: unknown): value is string {
  return typeof value === 'string' && VARIABLE_NAME_PATTERN.test(value);
}

function binarySchema(type: 'add' | 'divide' | 'multiply' | 'subtract') {
  return z.strictObject({
    type: z.literal(type),
    left: FormulaValueSchema,
    right: FormulaValueSchema,
  });
}

function aggregateSchema(type: 'max' | 'min') {
  return z.strictObject({
    type: z.literal(type),
    operands: z.array(FormulaValueSchema).min(1, `${type} requires at least one operand.`),
  });
}

function unarySchema(type: 'ceil' | 'floor' | 'round') {
  return z.strictObject({ type: z.literal(type), operand: FormulaValueSchema });
}

interface PendingValue {
  readonly depth: number;
  readonly value: unknown;
}

function validateSafeStructure(root: unknown): string | undefined {
  const pending: PendingValue[] = [{ depth: 1, value: root }];
  let nodeCount = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodeCount += 1;
    if (nodeCount > MAX_FORMULA_NODES) {
      return `Formula exceeds the maximum of ${MAX_FORMULA_NODES} nodes.`;
    }
    if (current.depth > MAX_FORMULA_DEPTH) {
      return `Formula exceeds the maximum depth of ${MAX_FORMULA_DEPTH}.`;
    }

    const inspection = inspectPlainDataObject(current.value);
    if (typeof inspection === 'string') return inspection;
    const type = inspection.type?.value;
    if (typeof type !== 'string') continue;

    const childValues: unknown[] = [];
    if (['add', 'subtract', 'multiply', 'divide'].includes(type)) {
      childValues.push(inspection.left?.value, inspection.right?.value);
    } else if (['round', 'ceil', 'floor'].includes(type)) {
      childValues.push(inspection.operand?.value);
    } else if (type === 'if') {
      childValues.push(inspection.condition?.value, inspection.then?.value, inspection.else?.value);
    } else if (type === 'compare') {
      childValues.push(inspection.left?.value, inspection.right?.value);
    } else if (type === 'min' || type === 'max') {
      const operands = inspection.operands?.value;
      const arrayError = inspectPlainDataArray(operands);
      if (arrayError) return arrayError;
      if (!Array.isArray(operands)) return 'Formula operands must be a plain data array.';
      if (operands.length > MAX_FORMULA_NODES) {
        return `Formula exceeds the maximum of ${MAX_FORMULA_NODES} nodes.`;
      }
      childValues.push(...operands);
    }

    for (let index = childValues.length - 1; index >= 0; index -= 1) {
      pending.push({ depth: current.depth + 1, value: childValues[index] });
    }
  }

  return undefined;
}

function inspectPlainDataObject(value: unknown): Record<string, PropertyDescriptor> | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'Every formula node must be a plain data object.';
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return 'Every formula node must use a plain data-object prototype.';
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return 'Formula nodes may contain only string data properties.';
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!descriptor.enumerable || !('value' in descriptor)) {
      return 'Formula nodes may contain only enumerable data properties.';
    }
  }
  return descriptors;
}

function inspectPlainDataArray(value: unknown): string | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return 'Formula operands must be a plain data array.';
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return 'Formula operands may contain only indexed data properties.';
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length') continue;
    if (!/^(0|[1-9][0-9]*)$/u.test(key) || !descriptor.enumerable || !('value' in descriptor)) {
      return 'Formula operands may contain only indexed data properties.';
    }
  }
  return undefined;
}
