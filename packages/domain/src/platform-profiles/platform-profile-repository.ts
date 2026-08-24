import type { ProductPlatformProfile, PlatformId } from './platform-profile.js';
import type { UuidV7 } from '../ids.js';

export interface PlatformProfileRepository {
  find(productId: UuidV7, platformId: PlatformId): Promise<ProductPlatformProfile | undefined>;
  list(productId: UuidV7): Promise<readonly ProductPlatformProfile[]>;
  create(profile: ProductPlatformProfile): Promise<ProductPlatformProfile>;
  update(
    profile: ProductPlatformProfile,
    expectedUpdatedAt: Date,
  ): Promise<ProductPlatformProfile | undefined>;
}
