import {
  createPlatformProfile,
  createUuidV7,
  DomainError,
  parseUuidV7,
  updatePlatformProfile,
  type PlatformId,
  type PlatformProfileFields,
  type PlatformProfileRepository,
  type ProductPlatformProfile,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';

export interface PlatformProfilesApplication {
  list(productId: string): Promise<readonly ProductPlatformProfile[]>;
  get(productId: string, platformId: PlatformId): Promise<ProductPlatformProfile | undefined>;
  save(
    productId: string,
    platformId: PlatformId,
    input: PlatformProfileFields & { readonly expectedUpdatedAt?: Date },
  ): Promise<ProductPlatformProfile>;
}

export function createPlatformProfilesApplication(dependencies: {
  readonly repository: PlatformProfileRepository;
  readonly products: ProductRepository;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}): PlatformProfilesApplication {
  const idFactory = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  const owner = async (value: string): Promise<UuidV7> => {
    const product = await dependencies.products.findById(parseUuidV7(value));
    if (!product || product.archivedAt !== null) {
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    }
    return product.id;
  };

  return {
    async list(productId) {
      return dependencies.repository.list(await owner(productId));
    },
    async get(productId, platformId) {
      return dependencies.repository.find(await owner(productId), platformId);
    },
    async save(productIdValue, platformId, input) {
      const productId = await owner(productIdValue);
      const existing = await dependencies.repository.find(productId, platformId);
      if (!existing) {
        if (input.expectedUpdatedAt !== undefined) {
          throw new DomainError('CONFLICT', 'Platform profile does not exist.');
        }
        return dependencies.repository.create(
          createPlatformProfile({
            ...input,
            id: idFactory(),
            productId,
            platformId,
            now: now(),
          }),
        );
      }
      if (input.expectedUpdatedAt === undefined) {
        throw new DomainError('CONFLICT', 'Platform profile changed; reload.');
      }
      const updated = updatePlatformProfile(existing, {
        ...input,
        expectedUpdatedAt: input.expectedUpdatedAt,
        now: nextTimestamp(existing.updatedAt, now()),
      });
      const saved = await dependencies.repository.update(updated, input.expectedUpdatedAt);
      if (!saved) throw new DomainError('CONFLICT', 'Platform profile changed; reload.');
      return saved;
    },
  };
}

function nextTimestamp(previous: Date, current: Date): Date {
  return new Date(Math.max(current.getTime(), previous.getTime() + 1));
}
