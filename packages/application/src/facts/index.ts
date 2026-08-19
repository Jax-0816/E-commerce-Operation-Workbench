import {
  confirmProductFact,
  createProductFact,
  createUuidV7,
  DomainError,
  normalizeFactKey,
  nextTimestamp,
  parseUuidV7,
  type FactSourceType,
  type FactValue,
  type FactVerification,
  type ProductFact,
  type ProductFactRepository,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';

export interface FactDraftInput {
  readonly key: string;
  readonly label: string;
  readonly value: FactValue | null;
  readonly unit: string | null;
  readonly sourceType: FactSourceType;
  readonly sourceRef: string | null;
  readonly verification: Exclude<FactVerification, 'confirmed'>;
  readonly sensitive: boolean;
  readonly policyEligible: boolean;
}

export type UpdateFactInput = Omit<FactDraftInput, 'key'> & {
  readonly expectedUpdatedAt: Date;
};

export type ReviseFactInput = Omit<FactDraftInput, 'key'>;

export interface ConfirmFactInput {
  readonly expectedUpdatedAt: Date;
  readonly actorRef: string;
  readonly evidenceRef: string;
}

export interface DeleteFactInput {
  readonly expectedUpdatedAt: Date;
}

export interface FactsApplication {
  create(productId: string, input: FactDraftInput): Promise<ProductFact>;
  list(productId: string): Promise<readonly ProductFact[]>;
  get(productId: string, factId: string): Promise<ProductFact>;
  update(productId: string, factId: string, input: UpdateFactInput): Promise<ProductFact>;
  confirm(productId: string, factId: string, input: ConfirmFactInput): Promise<ProductFact>;
  revise(productId: string, factId: string, input: ReviseFactInput): Promise<ProductFact>;
  delete(productId: string, factId: string, input: DeleteFactInput): Promise<void>;
}

export interface FactsApplicationDependencies {
  readonly repository: ProductFactRepository;
  readonly products: ProductRepository;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}

export function createFactsApplication({
  repository,
  products,
  idFactory = createUuidV7,
  now = () => new Date(),
}: FactsApplicationDependencies): FactsApplication {
  async function requireActiveProduct(id: UuidV7): Promise<void> {
    const product = await products.findById(id);
    if (product === undefined || product.archivedAt !== null) {
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    }
  }

  async function requireFact(owner: UuidV7, id: UuidV7): Promise<ProductFact> {
    const fact = await repository.findById(owner, id);
    if (fact === undefined) throw new DomainError('NOT_FOUND', 'Product fact was not found.');
    return fact;
  }

  return {
    async create(productId, input) {
      const owner = parseUuidV7(productId);
      await requireActiveProduct(owner);
      if (await repository.findCurrentByKey(owner, normalizeFactKey(input.key))) {
        throw new DomainError('CONFLICT', 'A current fact already has this key.', { field: 'key' });
      }
      return repository.create(
        createProductFact({ ...input, id: idFactory(), productId: owner, now: now() }),
      );
    },
    async list(productId) {
      const owner = parseUuidV7(productId);
      await requireActiveProduct(owner);
      return repository.listCurrent(owner);
    },
    async get(productId, factId) {
      const owner = parseUuidV7(productId);
      await requireActiveProduct(owner);
      return requireFact(owner, parseUuidV7(factId));
    },
    async update(productId, factId, input) {
      const owner = parseUuidV7(productId);
      await requireActiveProduct(owner);
      const existing = await requireFact(owner, parseUuidV7(factId));
      if (existing.verification === 'confirmed') {
        throw new DomainError(
          'CONFLICT',
          'Confirmed facts are immutable; create a revision instead.',
        );
      }
      const changedAt = nextTimestamp(existing.updatedAt, now());
      const validated = createProductFact({
        ...input,
        id: existing.id,
        productId: owner,
        key: existing.key,
        lineageId: existing.lineageId,
        revisionNo: existing.revisionNo,
        supersedesFactId: existing.supersedesFactId,
        now: existing.createdAt,
      });
      const updated: ProductFact = {
        ...validated,
        createdAt: existing.createdAt,
        updatedAt: changedAt,
      };
      const saved = await repository.updateDraft(updated, input.expectedUpdatedAt);
      if (saved === undefined) throw staleFact();
      return saved;
    },
    async confirm(productId, factId, input) {
      const owner = parseUuidV7(productId);
      await requireActiveProduct(owner);
      const existing = await requireFact(owner, parseUuidV7(factId));
      const confirmed = confirmProductFact(
        existing,
        { actorType: 'user', actorRef: input.actorRef, evidenceRef: input.evidenceRef },
        now(),
      );
      const saved = await repository.confirm(confirmed, input.expectedUpdatedAt);
      if (saved === undefined) throw staleFact();
      return saved;
    },
    async revise(productId, factId, input) {
      const owner = parseUuidV7(productId);
      await requireActiveProduct(owner);
      const existing = await requireFact(owner, parseUuidV7(factId));
      if (existing.verification !== 'confirmed') {
        throw new DomainError('CONFLICT', 'Only a confirmed fact needs a new revision.');
      }
      const revision = createProductFact({
        ...input,
        id: idFactory(),
        productId: owner,
        key: existing.key,
        lineageId: existing.lineageId,
        revisionNo: (await repository.maxRevisionNo(owner, existing.lineageId)) + 1,
        supersedesFactId: existing.id,
        now: nextTimestamp(existing.updatedAt, now()),
      });
      return repository.replaceCurrent(existing, revision);
    },
    async delete(productId, factId, input) {
      const owner = parseUuidV7(productId);
      await requireActiveProduct(owner);
      const existing = await requireFact(owner, parseUuidV7(factId));
      if (existing.verification === 'confirmed') {
        throw new DomainError(
          'CONFLICT',
          'Confirmed facts are immutable; create a revision instead.',
        );
      }
      const deletedAt = nextTimestamp(existing.updatedAt, now());
      if (!(await repository.deleteDraft(owner, existing.id, input.expectedUpdatedAt, deletedAt)))
        throw staleFact();
    },
  };
}

function staleFact(): DomainError {
  return new DomainError('CONFLICT', 'Product fact changed; reload before retrying.');
}
