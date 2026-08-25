import type { RoundingMode } from './rounding.js';

export interface CalculationTraceStep {
  readonly expression: string;
  readonly inputs: Readonly<Record<string, number | string>>;
  readonly operation: string;
  readonly outputMinorUnits: number;
  readonly roundingMode: RoundingMode;
}

export function calculationTraceStep(input: CalculationTraceStep): CalculationTraceStep {
  if (!input.expression.trim()) throw new TypeError('Trace expression cannot be blank.');
  if (!input.operation.trim()) throw new TypeError('Trace operation cannot be blank.');
  if (!Number.isSafeInteger(input.outputMinorUnits) || input.outputMinorUnits < 0) {
    throw new RangeError('Trace output must be a non-negative safe integer.');
  }
  return Object.freeze({ ...input, inputs: Object.freeze({ ...input.inputs }) });
}
