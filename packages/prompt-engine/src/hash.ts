import { createHash } from 'node:crypto';

import { PromptTemplateSchema, type PromptTemplate } from './template.js';

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function canonicalJson(input: unknown): string {
  if (input === null || typeof input === 'boolean' || typeof input === 'string') {
    return JSON.stringify(input);
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new TypeError('Canonical JSON cannot contain non-finite numbers.');
    }
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(',')}]`;
  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`).join(',')}}`;
  }
  throw new TypeError('Canonical JSON contains an unsupported value.');
}

export function calculateTemplateHash(input: PromptTemplate): string {
  return sha256(canonicalJson(PromptTemplateSchema.parse(input)));
}
