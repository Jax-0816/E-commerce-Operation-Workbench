import { DomainError } from '@eaw/domain';

export const CANONICAL_PLATFORM_IDS = ['pinduoduo', 'taobao_tmall', 'douyin_ecommerce'] as const;
export type CanonicalPlatformId = (typeof CANONICAL_PLATFORM_IDS)[number];
export type PlatformAlias = 'taobao' | 'douyin';
export type PlatformIdentifier = CanonicalPlatformId | PlatformAlias;

export interface PlatformDefinition {
  readonly id: CanonicalPlatformId;
  readonly profileId: 'pinduoduo' | 'taobao' | 'douyin';
  readonly displayName: string;
  readonly aliases: readonly PlatformAlias[];
}

const definitions: readonly PlatformDefinition[] = Object.freeze([
  Object.freeze({
    id: 'pinduoduo',
    profileId: 'pinduoduo',
    displayName: '拼多多',
    aliases: Object.freeze([] as PlatformAlias[]),
  }),
  Object.freeze({
    id: 'taobao_tmall',
    profileId: 'taobao',
    displayName: '淘宝/天猫',
    aliases: Object.freeze(['taobao'] as PlatformAlias[]),
  }),
  Object.freeze({
    id: 'douyin_ecommerce',
    profileId: 'douyin',
    displayName: '抖音电商',
    aliases: Object.freeze(['douyin'] as PlatformAlias[]),
  }),
]);

export function listPlatforms(): readonly PlatformDefinition[] {
  return definitions;
}

export function getPlatform(identifier: PlatformIdentifier): PlatformDefinition {
  const platform = definitions.find(
    ({ id, aliases }) => id === identifier || aliases.includes(identifier as PlatformAlias),
  );
  if (!platform) throw new DomainError('VALIDATION_ERROR', 'Platform is not registered.');
  return platform;
}
