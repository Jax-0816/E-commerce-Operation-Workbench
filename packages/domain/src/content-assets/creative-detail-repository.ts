import type { PlatformId } from '../platform-profiles/platform-profile.js';
import type { UuidV7 } from '../ids.js';
import type { CreativePlanRevision } from './creative-plan.js';
import type { DetailPageRevision } from './detail-page.js';

type RevisionManaged = 'revisionNo' | 'supersedesRevisionId';

export type AppendCreativePlanInput = Omit<CreativePlanRevision, RevisionManaged>;
export type AppendDetailPageInput = Omit<DetailPageRevision, RevisionManaged>;

export interface CreativePlanRepository {
  append(input: AppendCreativePlanInput): Promise<CreativePlanRevision>;
  latest(productId: UuidV7, platformId: PlatformId): Promise<CreativePlanRevision | undefined>;
  list(productId: UuidV7, platformId: PlatformId): Promise<readonly CreativePlanRevision[]>;
}

export interface DetailPageRepository {
  append(input: AppendDetailPageInput): Promise<DetailPageRevision>;
  latest(productId: UuidV7, platformId: PlatformId): Promise<DetailPageRevision | undefined>;
  list(productId: UuidV7, platformId: PlatformId): Promise<readonly DetailPageRevision[]>;
}
