import type { UuidV7 } from '../ids.js';
import type { PlatformId } from '../platform-profiles/platform-profile.js';
import type { TitleAssetRevision } from './title-asset.js';

export type AppendTitleRevisionInput = Omit<
  TitleAssetRevision,
  'revisionNo' | 'supersedesRevisionId'
>;

export interface TitleAssetRepository {
  append(input: AppendTitleRevisionInput): Promise<TitleAssetRevision>;
  latest(productId: UuidV7, platformId: PlatformId): Promise<TitleAssetRevision | undefined>;
  list(productId: UuidV7, platformId: PlatformId): Promise<readonly TitleAssetRevision[]>;
}
