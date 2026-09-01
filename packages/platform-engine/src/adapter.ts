import { DomainError } from '@eaw/domain';

import { requireCapability } from './capabilities.js';
import { buildPlatformContext, type PlatformContext } from './context.js';
import { getPlatform, listPlatforms, type PlatformIdentifier } from './registry.js';

export interface ContentDraft {
  readonly title: string;
  readonly description: string | null;
}

export interface PreparedContent {
  readonly title: string;
  readonly description: string | null;
}

export interface PlatformAdapter {
  readonly context: PlatformContext;
  prepareContent(input: ContentDraft): PreparedContent;
}

export interface GenericContentAdapterOptions {
  readonly platformId: PlatformIdentifier;
  readonly titleMaximum?: number;
  readonly descriptionMaximum?: number;
}

export function createGenericContentAdapter({
  platformId,
  titleMaximum = 300,
  descriptionMaximum = 5000,
}: GenericContentAdapterOptions): PlatformAdapter {
  const context = buildPlatformContext({ platformId });
  validMaximum(titleMaximum);
  validMaximum(descriptionMaximum);
  return Object.freeze({
    context,
    prepareContent(input: ContentDraft) {
      requireCapability(context, 'content');
      const title = input.title.trim().replace(/\s+/gu, ' ');
      const description = input.description?.trim().replace(/\n{3,}/gu, '\n\n') || null;
      if (
        !title ||
        title.length > titleMaximum ||
        (description?.length ?? 0) > descriptionMaximum
      ) {
        throw new DomainError('VALIDATION_ERROR', 'Content exceeds the platform adapter limits.');
      }
      return Object.freeze({ title, description });
    },
  });
}

const adapters = new Map(
  listPlatforms().map((platform) => [
    platform.id,
    createGenericContentAdapter({ platformId: platform.id }),
  ]),
);

export function getPlatformAdapter(platformId: PlatformIdentifier): PlatformAdapter {
  const adapter = adapters.get(getPlatform(platformId).id);
  if (!adapter) throw new DomainError('CAPABILITY_UNAVAILABLE', 'Platform adapter is unavailable.');
  return adapter;
}

function validMaximum(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainError('VALIDATION_ERROR', 'Platform content limit is invalid.');
  }
}
