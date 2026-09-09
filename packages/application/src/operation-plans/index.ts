import {
  createOperationPlanRevision,
  createUuidV7,
  DomainError,
  lockOperationPlanRevision,
  parseUuidV7,
  type OperationPlanBlocker,
  type OperationPlanRepository,
  type OperationPlanRevision,
  type OperationPlanSources,
  type PlatformId,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';
import { canonicalJson, sha256 } from '@eaw/prompt-engine';

export { createRepositoryOperationPlanSourceResolver } from './repository-source-resolver.js';

export interface CreateOperationPlanInput {
  readonly workflowRunId: string;
  readonly pricingRecordId: string;
  readonly promotionScenarioId?: string;
  readonly promotionResultIds?: readonly string[];
}

export interface ResolvedOperationPlanSources {
  readonly platformId: PlatformId;
  readonly sources: OperationPlanSources;
  readonly blockers: readonly OperationPlanBlocker[];
}

export interface OperationPlanSourceResolver {
  resolve(
    productId: UuidV7,
    input: CreateOperationPlanInput,
  ): Promise<ResolvedOperationPlanSources>;
  revalidate(plan: OperationPlanRevision): Promise<readonly OperationPlanBlocker[]>;
}

export interface OperationPlansApplication {
  createDraft(productId: string, input: CreateOperationPlanInput): Promise<OperationPlanRevision>;
  list(productId: string): Promise<readonly OperationPlanRevision[]>;
  get(planId: string): Promise<OperationPlanRevision>;
  lock(planId: string, expectedRevisionNo: number): Promise<OperationPlanRevision>;
}

export function createOperationPlansApplication(dependencies: {
  readonly products: ProductRepository;
  readonly repository: OperationPlanRepository;
  readonly resolver: OperationPlanSourceResolver;
  readonly idFactory?: (now: Date) => UuidV7;
  readonly now?: () => Date;
}): OperationPlansApplication {
  const now = dependencies.now ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? createUuidV7;
  const owner = async (value: string): Promise<UuidV7> => {
    let productId: UuidV7;
    try {
      productId = parseUuidV7(value);
    } catch {
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    }
    const product = await dependencies.products.findById(productId);
    if (!product || product.archivedAt)
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    return product.id;
  };
  const plan = async (value: string): Promise<OperationPlanRevision> => {
    let id: UuidV7;
    try {
      id = parseUuidV7(value);
    } catch {
      throw new DomainError('NOT_FOUND', 'Operation plan was not found.');
    }
    const found = await dependencies.repository.findById(id);
    if (!found) throw new DomainError('NOT_FOUND', 'Operation plan was not found.');
    await owner(found.productId);
    return found;
  };
  const present = async (value: OperationPlanRevision): Promise<OperationPlanRevision> =>
    value.status === 'locked'
      ? value
      : { ...value, blockers: await dependencies.resolver.revalidate(value) };
  return {
    async createDraft(productIdValue, input) {
      const productId = await owner(productIdValue);
      const resolved = await dependencies.resolver.resolve(productId, input);
      const createdAt = now();
      const id = idFactory(createdAt);
      const draft = createOperationPlanRevision({
        id,
        lineageId: id,
        productId,
        platformId: resolved.platformId,
        revisionNo: 1,
        status: 'draft',
        lockedAt: null,
        sources: resolved.sources,
        sourceHash: sha256(canonicalJson(resolved.sources)),
        blockers: resolved.blockers,
        supersedesRevisionId: null,
        createdAt,
      });
      return dependencies.repository.append(draft, null);
    },
    async list(productIdValue) {
      const values = await dependencies.repository.list(await owner(productIdValue));
      return Promise.all(values.map(present));
    },
    async get(planId) {
      return present(await plan(planId));
    },
    async lock(planId, expectedRevisionNo) {
      const draft = await plan(planId);
      const latest = await dependencies.repository.latest(draft.lineageId);
      if (
        !Number.isSafeInteger(expectedRevisionNo) ||
        expectedRevisionNo < 1 ||
        draft.revisionNo !== expectedRevisionNo ||
        latest?.id !== draft.id
      ) {
        throw new DomainError('CONFLICT', 'Operation plan revision conflict.');
      }
      const blockers = await dependencies.resolver.revalidate(draft);
      if (blockers.length > 0) {
        throw new DomainError(
          'CONFLICT',
          'Operation plan sources must be resolved before locking.',
          {
            blockers: blockers.map(({ code, source }) => `${code}:${source}`).join(','),
          },
        );
      }
      const lockedAt = now();
      const locked = lockOperationPlanRevision(draft, idFactory(lockedAt), lockedAt);
      return dependencies.repository.append(locked, expectedRevisionNo);
    },
  };
}
