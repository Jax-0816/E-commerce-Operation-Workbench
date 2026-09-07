import {
  createUuidV7,
  DomainError,
  evaluateDependencyStaleness,
  lockCreativeItem,
  lockDetailSection,
  parseUuidV7,
  reorderCreativeItems,
  reorderDetailSections,
  replaceCreativeItem,
  type ContentValidationIssue,
  type CreativeItem,
  type CreativePlanRepository,
  type CreativePlanRevision,
  type DetailPageRepository,
  type DetailPageRevision,
  type DetailPageSection,
  type PlatformId,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';

export interface CreativePlanView {
  readonly revision: CreativePlanRevision;
  readonly stale: boolean;
  readonly staleReasons: readonly string[];
}
export interface DetailPageView {
  readonly revision: DetailPageRevision;
  readonly stale: boolean;
  readonly staleReasons: readonly string[];
}
interface GeneratedCreative {
  readonly items: readonly CreativeItem[];
  readonly status: CreativePlanRevision['status'];
  readonly validationIssues: readonly ContentValidationIssue[];
  readonly dependencyHashes: Readonly<Record<string, string>>;
  readonly generationId: UuidV7;
}
interface GeneratedDetail {
  readonly sections: readonly DetailPageSection[];
  readonly status: DetailPageRevision['status'];
  readonly validationIssues: readonly ContentValidationIssue[];
  readonly dependencyHashes: Readonly<Record<string, string>>;
  readonly generationId: UuidV7;
}
export interface ContentGenerationPort {
  generateCreative(
    productId: UuidV7,
    platformId: PlatformId,
    previous?: CreativePlanRevision,
  ): Promise<GeneratedCreative>;
  regenerateCreativeItem(
    productId: UuidV7,
    platformId: PlatformId,
    previous: CreativePlanRevision,
    itemId: UuidV7,
  ): Promise<Omit<GeneratedCreative, 'items'> & { readonly item: CreativeItem }>;
  generateDetail(
    productId: UuidV7,
    platformId: PlatformId,
    previous?: DetailPageRevision,
  ): Promise<GeneratedDetail>;
  currentHashes(
    productId: UuidV7,
    platformId: PlatformId,
  ): Promise<Readonly<Record<string, string>>>;
}
export interface ContentBuildersApplication {
  generateCreative(productId: string, platformId: PlatformId): Promise<CreativePlanView>;
  regenerateCreativeItem(
    productId: string,
    platformId: PlatformId,
    itemId: string,
  ): Promise<CreativePlanView>;
  lockCreativeItem(
    productId: string,
    platformId: PlatformId,
    itemId: string,
  ): Promise<CreativePlanView>;
  reorderCreative(
    productId: string,
    platformId: PlatformId,
    orderedIds: readonly string[],
  ): Promise<CreativePlanView>;
  listCreative(productId: string, platformId: PlatformId): Promise<readonly CreativePlanView[]>;
  generateDetail(productId: string, platformId: PlatformId): Promise<DetailPageView>;
  lockDetailSection(
    productId: string,
    platformId: PlatformId,
    sectionId: string,
  ): Promise<DetailPageView>;
  reorderDetail(
    productId: string,
    platformId: PlatformId,
    orderedIds: readonly string[],
  ): Promise<DetailPageView>;
  listDetail(productId: string, platformId: PlatformId): Promise<readonly DetailPageView[]>;
}

export function createContentBuildersApplication(dependencies: {
  readonly products: ProductRepository;
  readonly creative: CreativePlanRepository;
  readonly detail: DetailPageRepository;
  readonly generation?: ContentGenerationPort;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}): ContentBuildersApplication {
  const id = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  const creativeView = async (revision: CreativePlanRevision) =>
    view(revision, dependencies.generation);
  const detailView = async (revision: DetailPageRevision) =>
    view(revision, dependencies.generation);
  return {
    async generateCreative(value, platformId) {
      const productId = await owner(value, dependencies.products);
      const generation = requiredGeneration(dependencies.generation);
      const previous = await dependencies.creative.latest(productId, platformId);
      const generated = await generation.generateCreative(productId, platformId, previous);
      const lockedItems = new Map(
        previous?.items.filter(({ locked }) => locked).map((item) => [item.id, item]) ?? [],
      );
      const items = generated.items.map((item) => lockedItems.get(item.id) ?? item);
      return creativeView(
        await dependencies.creative.append({
          id: id(),
          lineageId: previous?.lineageId ?? id(),
          productId,
          platformId,
          origin: 'generated',
          ...generated,
          items,
          createdAt: now(),
        }),
      );
    },
    async regenerateCreativeItem(value, platformId, itemValue) {
      const productId = await owner(value, dependencies.products);
      const previous = await requiredCreative(dependencies.creative, productId, platformId);
      const itemId = parseUuidV7(itemValue);
      const generated = await requiredGeneration(dependencies.generation).regenerateCreativeItem(
        productId,
        platformId,
        previous,
        itemId,
      );
      return creativeView(
        await dependencies.creative.append({
          id: id(),
          lineageId: previous.lineageId,
          productId,
          platformId,
          origin: 'regenerated_item',
          ...generated,
          items: replaceCreativeItem(previous.items, itemId, generated.item),
          createdAt: now(),
        }),
      );
    },
    async lockCreativeItem(value, platformId, itemValue) {
      const productId = await owner(value, dependencies.products);
      const previous = await requiredCreative(dependencies.creative, productId, platformId);
      return creativeView(
        await dependencies.creative.append({
          ...copyCreative(previous),
          id: id(),
          origin: 'locked_item',
          items: lockCreativeItem(previous.items, parseUuidV7(itemValue)),
          createdAt: now(),
        }),
      );
    },
    async reorderCreative(value, platformId, orderedIds) {
      const productId = await owner(value, dependencies.products);
      const previous = await requiredCreative(dependencies.creative, productId, platformId);
      return creativeView(
        await dependencies.creative.append({
          ...copyCreative(previous),
          id: id(),
          origin: 'reordered',
          items: reorderCreativeItems(previous.items, orderedIds.map(parseUuidV7)),
          createdAt: now(),
        }),
      );
    },
    async listCreative(value, platformId) {
      const productId = await owner(value, dependencies.products);
      return Promise.all(
        (await dependencies.creative.list(productId, platformId)).map(creativeView),
      );
    },
    async generateDetail(value, platformId) {
      const productId = await owner(value, dependencies.products);
      const generation = requiredGeneration(dependencies.generation);
      const previous = await dependencies.detail.latest(productId, platformId);
      const generated = await generation.generateDetail(productId, platformId, previous);
      const lockedSections = new Map(
        previous?.sections.filter(({ locked }) => locked).map((section) => [section.id, section]) ??
          [],
      );
      const sections = generated.sections.map(
        (section) => lockedSections.get(section.id) ?? section,
      );
      return detailView(
        await dependencies.detail.append({
          id: id(),
          lineageId: previous?.lineageId ?? id(),
          productId,
          platformId,
          origin: 'generated',
          ...generated,
          sections,
          createdAt: now(),
        }),
      );
    },
    async lockDetailSection(value, platformId, sectionValue) {
      const productId = await owner(value, dependencies.products);
      const previous = await requiredDetail(dependencies.detail, productId, platformId);
      return detailView(
        await dependencies.detail.append({
          ...copyDetail(previous),
          id: id(),
          origin: 'locked_section',
          sections: lockDetailSection(previous.sections, parseUuidV7(sectionValue)),
          createdAt: now(),
        }),
      );
    },
    async reorderDetail(value, platformId, orderedIds) {
      const productId = await owner(value, dependencies.products);
      const previous = await requiredDetail(dependencies.detail, productId, platformId);
      return detailView(
        await dependencies.detail.append({
          ...copyDetail(previous),
          id: id(),
          origin: 'reordered',
          sections: reorderDetailSections(previous.sections, orderedIds.map(parseUuidV7)),
          createdAt: now(),
        }),
      );
    },
    async listDetail(value, platformId) {
      const productId = await owner(value, dependencies.products);
      return Promise.all((await dependencies.detail.list(productId, platformId)).map(detailView));
    },
  };
}
async function owner(value: string, products: ProductRepository) {
  const product = await products.findById(parseUuidV7(value));
  if (!product || product.archivedAt) throw new DomainError('NOT_FOUND', 'Product was not found.');
  return product.id;
}
function requiredGeneration(value?: ContentGenerationPort): ContentGenerationPort {
  if (!value) throw new DomainError('CAPABILITY_UNAVAILABLE', 'Content generation is unavailable.');
  return value;
}
async function requiredCreative(
  repository: CreativePlanRepository,
  productId: UuidV7,
  platformId: PlatformId,
) {
  const value = await repository.latest(productId, platformId);
  if (!value) throw new DomainError('NOT_FOUND', 'Creative plan was not found.');
  return value;
}
async function requiredDetail(
  repository: DetailPageRepository,
  productId: UuidV7,
  platformId: PlatformId,
) {
  const value = await repository.latest(productId, platformId);
  if (!value) throw new DomainError('NOT_FOUND', 'Detail page was not found.');
  return value;
}
function copyCreative(value: CreativePlanRevision) {
  return {
    lineageId: value.lineageId,
    productId: value.productId,
    platformId: value.platformId,
    status: value.status,
    dependencyHashes: value.dependencyHashes,
    validationIssues: value.validationIssues,
    generationId: null,
  } as const;
}
function copyDetail(value: DetailPageRevision) {
  return {
    lineageId: value.lineageId,
    productId: value.productId,
    platformId: value.platformId,
    status: value.status,
    dependencyHashes: value.dependencyHashes,
    validationIssues: value.validationIssues,
    generationId: null,
  } as const;
}
async function view<T extends CreativePlanRevision | DetailPageRevision>(
  revision: T,
  generation?: ContentGenerationPort,
) {
  const hashes = generation
    ? await generation.currentHashes(revision.productId, revision.platformId)
    : revision.dependencyHashes;
  const stale = evaluateDependencyStaleness(revision.dependencyHashes, hashes);
  return { revision, stale: stale.stale, staleReasons: stale.reasons };
}
