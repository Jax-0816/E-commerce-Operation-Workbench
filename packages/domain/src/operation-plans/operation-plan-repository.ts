import type { UuidV7 } from '../ids.js';
import type { OperationPlanRevision } from './operation-plan.js';

export interface OperationPlanRepository {
  append(
    revision: OperationPlanRevision,
    expectedRevisionNo: number | null,
  ): Promise<OperationPlanRevision>;
  findById(id: UuidV7): Promise<OperationPlanRevision | undefined>;
  latest(lineageId: UuidV7): Promise<OperationPlanRevision | undefined>;
  list(productId: UuidV7): Promise<readonly OperationPlanRevision[]>;
}
