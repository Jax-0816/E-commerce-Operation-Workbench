import { DomainError } from '@eaw/domain';

import type { PlatformContext } from './context.js';

export const CAPABILITIES = ['content', 'creative', 'pricing', 'promotion', 'fee_model'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type CapabilityStatus =
  'supported' | 'generic' | 'requires_rule_pack' | 'incomplete' | 'unavailable';

export interface CapabilityState {
  readonly status: CapabilityStatus;
  readonly available: boolean;
  readonly message: string;
}

export type PlatformCapabilities = Readonly<Record<Capability, CapabilityState>>;

const supported = state('supported', true, '已支持');
const generic = state('generic', true, '仅提供通用能力，不包含平台专属费率或活动规则。');
const unavailable = state('unavailable', false, '当前平台此能力尚未完整实现。');
const incomplete = state('incomplete', false, '当前平台此能力尚未完整实现。');
const requiresRulePack = state(
  'requires_rule_pack',
  false,
  '需要完整且已验证的平台规则快照后才可使用。',
);

const baseMatrix: Readonly<Record<PlatformContext['platformId'], PlatformCapabilities>> =
  Object.freeze({
    pinduoduo: freezeCapabilities({
      content: supported,
      creative: supported,
      pricing: supported,
      promotion: requiresRulePack,
      fee_model: requiresRulePack,
    }),
    taobao_tmall: freezeCapabilities({
      content: supported,
      creative: supported,
      pricing: generic,
      promotion: unavailable,
      fee_model: incomplete,
    }),
    douyin_ecommerce: freezeCapabilities({
      content: supported,
      creative: supported,
      pricing: generic,
      promotion: unavailable,
      fee_model: incomplete,
    }),
  });

export function getCapabilities(context: PlatformContext): PlatformCapabilities {
  return baseMatrix[context.platformId];
}

export function requireCapability(context: PlatformContext, capability: Capability): void {
  const value = getCapabilities(context)[capability];
  if (!value.available) {
    throw new DomainError('CAPABILITY_UNAVAILABLE', value.message, {
      capability,
      platformId: context.platformId,
      status: value.status,
    });
  }
}

function state(status: CapabilityStatus, available: boolean, message: string): CapabilityState {
  return Object.freeze({ status, available, message });
}

function freezeCapabilities(value: Record<Capability, CapabilityState>): PlatformCapabilities {
  return Object.freeze(value);
}
