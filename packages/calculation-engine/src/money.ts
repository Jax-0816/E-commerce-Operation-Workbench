import type { Rational } from './rate.js';
import { divideAndRound, type RoundingPolicy } from './rounding.js';

export interface Money {
  readonly currency: string;
  readonly minorUnits: bigint;
}

const EXACT_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)\.([0-9]{2})$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

export function moneyFromMinorUnits(minorUnits: bigint, currency = 'CNY'): Money {
  if (minorUnits < 0n) throw new RangeError('Money cannot be negative.');
  assertCurrency(currency);
  return Object.freeze({ currency, minorUnits });
}

export function moneyFromDecimal(value: string, currency = 'CNY'): Money {
  if (value.startsWith('-')) throw new RangeError('Money cannot be negative.');
  const match = EXACT_DECIMAL_PATTERN.exec(value);
  if (!match) throw new TypeError('Money decimal must use exactly two fractional digits.');
  const [, whole, fraction] = match;
  return moneyFromMinorUnits(BigInt(whole) * 100n + BigInt(fraction), currency);
}

export function formatMoney(money: Money): string {
  const whole = money.minorUnits / 100n;
  const fraction = (money.minorUnits % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

export function serializeMinorUnits(money: Money): number {
  if (money.minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Money minor units exceed safe integer serialization.');
  }
  return Number(money.minorUnits);
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return moneyFromMinorUnits(left.minorUnits + right.minorUnits, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return moneyFromMinorUnits(left.minorUnits - right.minorUnits, left.currency);
}

export function multiplyMoney(money: Money, multiplier: Rational, policy: RoundingPolicy): Money {
  return moneyFromMinorUnits(
    divideAndRound(money.minorUnits * multiplier.numerator, multiplier.denominator, policy),
    money.currency,
  );
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new TypeError(`Money currency mismatch: ${left.currency} and ${right.currency}.`);
  }
}

function assertCurrency(currency: string): void {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new TypeError('Currency must be a canonical three-letter uppercase code.');
  }
}
