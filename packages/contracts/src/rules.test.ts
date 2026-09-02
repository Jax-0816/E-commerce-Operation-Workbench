import { describe, expect, it } from 'vitest';

import {
  ImportRulePackInputSchema,
  RulePackDiffResponseSchema,
  RulePackListQuerySchema,
} from './rules.js';

describe('rule pack HTTP contracts', () => {
  it('bounds inert JSON and base64 ZIP imports', () => {
    expect(ImportRulePackInputSchema.parse({ format: 'json', contents: '{}' })).toEqual({
      format: 'json',
      contents: '{}',
    });
    expect(
      ImportRulePackInputSchema.parse({ format: 'zip-base64', contents: 'UEsDBAoAAAA=' }),
    ).toMatchObject({ format: 'zip-base64' });
    expect(() =>
      ImportRulePackInputSchema.parse({ format: 'zip-base64', contents: '../not-base64' }),
    ).toThrow();
    expect(() =>
      ImportRulePackInputSchema.parse({ format: 'json', contents: 'x'.repeat(2_000_001) }),
    ).toThrow();
  });

  it('requires canonical platform ids and a non-empty region', () => {
    expect(RulePackListQuerySchema.parse({ platformId: 'pinduoduo', region: 'CN' })).toEqual({
      platformId: 'pinduoduo',
      region: 'CN',
    });
    expect(() => RulePackListQuerySchema.parse({ platformId: 'taobao', region: 'CN' })).toThrow();
  });

  it('rejects malformed diff payloads', () => {
    expect(() =>
      RulePackDiffResponseSchema.parse({ added: [], removed: [], changed: [{ key: '' }] }),
    ).toThrow();
  });
});
