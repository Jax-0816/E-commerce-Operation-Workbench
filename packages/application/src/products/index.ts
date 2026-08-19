import {
  createProduct,
  createUuidV7,
  DomainError,
  normalizeProductName,
  parseUuidV7,
  type Product,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';

export interface CreateProductInput {
  readonly name: string;
}

export interface ProductsApplication {
  create(input: CreateProductInput): Promise<Product>;
  list(): Promise<readonly Product[]>;
  get(id: string): Promise<Product>;
  archive(id: string): Promise<Product>;
}

export interface ProductsApplicationDependencies {
  readonly repository: ProductRepository;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}

export function createProductsApplication({
  repository,
  idFactory = createUuidV7,
  now = () => new Date(),
}: ProductsApplicationDependencies): ProductsApplication {
  return {
    async create(input) {
      const product = createProduct({ id: idFactory(), name: input.name, now: now() });
      if (await repository.findActiveByName(normalizeProductName(product.name))) {
        throw new DomainError('CONFLICT', 'An active product already has this name.', {
          field: 'name',
        });
      }

      return repository.create(product);
    },
    list: () => repository.list(),
    async get(id) {
      const product = await repository.findById(parseUuidV7(id));
      if (product === undefined || product.archivedAt !== null) {
        throw new DomainError('NOT_FOUND', 'Product was not found.');
      }
      return product;
    },
    async archive(id) {
      const product = await repository.archive(parseUuidV7(id), now());
      if (product === undefined) {
        throw new DomainError('NOT_FOUND', 'Product was not found.');
      }
      return product;
    },
  };
}
