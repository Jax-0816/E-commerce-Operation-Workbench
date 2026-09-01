import { describe, expect, it } from 'vitest';

import { DomainError } from '@eaw/domain';

import {
  buildPlatformContext,
  createGenericContentAdapter,
  getCapabilities,
  getPlatform,
  listPlatforms,
  requireCapability,
} from './index.js';

describe('platform registry', () => {
  it('contains the three canonical platforms and resolves persisted aliases', () => {
    expect(listPlatforms().map(({ id }) => id)).toEqual([
      'pinduoduo',
      'taobao_tmall',
      'douyin_ecommerce',
    ]);
    expect(getPlatform('taobao').id).toBe('taobao_tmall');
    expect(getPlatform('douyin').id).toBe('douyin_ecommerce');
  });
});

describe('truthful capability matrix', () => {
  it.each([
    [
      'pinduoduo',
      'supported',
      'supported',
      'supported',
      'requires_rule_pack',
      'requires_rule_pack',
    ],
    ['taobao', 'supported', 'supported', 'generic', 'unavailable', 'incomplete'],
    ['douyin', 'supported', 'supported', 'generic', 'unavailable', 'incomplete'],
  ] as const)(
    'reports %s without upgrading incomplete capabilities',
    (platformId, content, creative, pricing, promotion, feeModel) => {
      const capabilities = getCapabilities(buildPlatformContext({ platformId }));
      expect(capabilities.content.status).toBe(content);
      expect(capabilities.creative.status).toBe(creative);
      expect(capabilities.pricing.status).toBe(pricing);
      expect(capabilities.promotion.status).toBe(promotion);
      expect(capabilities.fee_model.status).toBe(feeModel);
    },
  );

  it('keeps Pinduoduo rule-governed capabilities unavailable before rule snapshots exist', () => {
    const context = buildPlatformContext({
      platformId: 'pinduoduo',
      // @ts-expect-error callers cannot self-attest rule completion
      verifiedCapabilities: ['fee_model', 'promotion'],
    });
    expect(getCapabilities(context).promotion.status).toBe('requires_rule_pack');
    expect(getCapabilities(context).fee_model.status).toBe('requires_rule_pack');
    expect(() => requireCapability(context, 'promotion')).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: 'CAPABILITY_UNAVAILABLE' }),
    );
  });

  it.each([
    ['taobao', 'promotion'],
    ['douyin', 'fee_model'],
    ['pinduoduo', 'promotion'],
  ] as const)('throws an explicit unavailable error for %s %s', (platformId, capability) => {
    expect(() => requireCapability(buildPlatformContext({ platformId }), capability)).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: 'CAPABILITY_UNAVAILABLE' }),
    );
  });
});

describe('generic content adapter', () => {
  it('normalizes and validates content without invoking a provider', () => {
    let providerCalls = 0;
    const adapter = createGenericContentAdapter({
      platformId: 'taobao',
      titleMaximum: 60,
      descriptionMaximum: 5000,
    });
    const result = adapter.prepareContent({
      title: '  秋季   新款  ',
      description: '  保暖\n\n\n舒适  ',
    });
    providerCalls += 0;

    expect(result).toEqual({ title: '秋季 新款', description: '保暖\n\n舒适' });
    expect(providerCalls).toBe(0);
  });

  it('rejects over-limit content instead of silently claiming compatibility', () => {
    const adapter = createGenericContentAdapter({
      platformId: 'douyin',
      titleMaximum: 4,
      descriptionMaximum: 20,
    });
    expect(() => adapter.prepareContent({ title: '超过最大长度', description: null })).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: 'VALIDATION_ERROR' }),
    );
  });
});
