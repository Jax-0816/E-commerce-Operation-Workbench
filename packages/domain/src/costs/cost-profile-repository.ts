import type { UuidV7 } from '../ids.js';
import type { CostProfile } from './cost-profile.js';

export interface CostProfileRepository {
  findBySkuId(skuId: UuidV7): Promise<CostProfile | undefined>;
  create(profile: CostProfile): Promise<CostProfile>;
  update(profile: CostProfile, expectedRevisionNo: number): Promise<CostProfile | undefined>;
}
