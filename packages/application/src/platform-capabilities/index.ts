import {
  buildPlatformContext,
  getCapabilities,
  getPlatform,
  type PlatformCapabilities,
  type PlatformContext,
  type PlatformIdentifier,
} from '@eaw/platform-engine';

export interface PlatformCapabilityView {
  readonly context: PlatformContext;
  readonly displayName: string;
  readonly capabilities: PlatformCapabilities;
}

export interface PlatformCapabilitiesApplication {
  get(platformId: PlatformIdentifier, categoryCode?: string | null): PlatformCapabilityView;
}

export function createPlatformCapabilitiesApplication(): PlatformCapabilitiesApplication {
  return Object.freeze({
    get(platformId: PlatformIdentifier, categoryCode: string | null = null) {
      const context = buildPlatformContext({ platformId, categoryCode });
      return Object.freeze({
        context,
        displayName: getPlatform(platformId).displayName,
        capabilities: getCapabilities(context),
      });
    },
  });
}
