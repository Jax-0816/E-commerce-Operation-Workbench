import { getPlatform, type CanonicalPlatformId, type PlatformIdentifier } from './registry.js';

export interface PlatformContext {
  readonly platformId: CanonicalPlatformId;
  readonly profilePlatformId: 'pinduoduo' | 'taobao' | 'douyin';
  readonly categoryCode: string | null;
}

export interface BuildPlatformContextInput {
  readonly platformId: PlatformIdentifier;
  readonly categoryCode?: string | null;
}

export function buildPlatformContext(input: BuildPlatformContextInput): PlatformContext {
  const platform = getPlatform(input.platformId);
  return Object.freeze({
    platformId: platform.id,
    profilePlatformId: platform.profileId,
    categoryCode: input.categoryCode?.trim() || null,
  });
}
