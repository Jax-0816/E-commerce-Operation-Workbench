import { FormulaNodeSchema, moneyFromMinorUnits, roundingPolicy } from '@eaw/calculation-engine';
import {
  createCostProfile,
  createPricingResultRecord,
  createPricingScenario,
  createUuidV7,
  DomainError,
  parseUuidV7,
  reviseCostProfile,
  type CostProfile,
  type CostProfileItem,
  type CostProfileRepository,
  type PricingRepository,
  type PricingResultRecord,
  type PricingScenario,
  type ProductRepository,
  type SkuMatrixRepository,
  type UuidV7,
} from '@eaw/domain';
import {
  calculatePricing,
  type CostItem,
  type PricingGoal,
  type PricingResult,
} from '@eaw/pricing-engine';

export interface SaveCostProfileInput {
  readonly currency: string;
  readonly expectedRevisionNo?: number;
  readonly items: readonly CostProfileItem[];
}

export interface CalculatePricingInput {
  readonly goal: PricingGoal;
  readonly name: string;
  readonly search: { readonly maximumMinorUnits: bigint; readonly minimumMinorUnits: bigint };
}

export interface PricingCalculation {
  readonly pricing: PricingResult;
  readonly record: PricingResultRecord;
  readonly scenario: PricingScenario;
}

export interface PricingApplication {
  calculate(
    productId: string,
    skuId: string,
    input: CalculatePricingInput,
  ): Promise<PricingCalculation>;
  getCostProfile(productId: string, skuId: string): Promise<CostProfile | undefined>;
  listHistory(
    productId: string,
    skuId: string,
  ): Promise<
    readonly {
      readonly scenario: PricingScenario;
      readonly results: readonly PricingResultRecord[];
    }[]
  >;
  saveCostProfile(
    productId: string,
    skuId: string,
    input: SaveCostProfileInput,
  ): Promise<CostProfile>;
}

export function createPricingApplication(dependencies: {
  readonly costs: CostProfileRepository;
  readonly engineVersion?: string;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
  readonly pricing: PricingRepository;
  readonly products: ProductRepository;
  readonly skus: SkuMatrixRepository;
}): PricingApplication {
  const idFactory = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  const engineVersion = dependencies.engineVersion ?? '0.1.0';

  const ownedSku = async (productIdValue: string, skuIdValue: string): Promise<UuidV7> => {
    const productId = parseUuidV7(productIdValue);
    const skuId = parseUuidV7(skuIdValue);
    const product = await dependencies.products.findById(productId);
    if (!product || product.archivedAt !== null) {
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    }
    const matrix = await dependencies.skus.load(product.id);
    const sku = matrix.skus.find((candidate) => candidate.id === skuId && candidate.enabled);
    if (!sku) throw new DomainError('NOT_FOUND', 'SKU was not found.');
    return sku.id;
  };

  return {
    async getCostProfile(productId, skuId) {
      return dependencies.costs.findBySkuId(await ownedSku(productId, skuId));
    },
    async saveCostProfile(productId, skuId, input) {
      const ownedSkuId = await ownedSku(productId, skuId);
      const existing = await dependencies.costs.findBySkuId(ownedSkuId);
      if (!existing) {
        if (input.expectedRevisionNo !== undefined) {
          throw new DomainError('CONFLICT', 'Cost profile does not exist.');
        }
        return dependencies.costs.create(
          createCostProfile({
            id: idFactory(),
            skuId: ownedSkuId,
            currency: input.currency,
            items: input.items,
            now: now(),
          }),
        );
      }
      if (input.expectedRevisionNo === undefined || input.currency !== existing.currency) {
        throw new DomainError('CONFLICT', 'Cost profile changed; reload.');
      }
      const revised = reviseCostProfile(existing, {
        expectedRevisionNo: input.expectedRevisionNo,
        items: input.items,
        now: nextTimestamp(existing.updatedAt, now()),
      });
      const saved = await dependencies.costs.update(revised, input.expectedRevisionNo);
      if (!saved) throw new DomainError('CONFLICT', 'Cost profile changed; reload.');
      return saved;
    },
    async calculate(productId, skuId, input) {
      const ownedSkuId = await ownedSku(productId, skuId);
      const profile = await dependencies.costs.findBySkuId(ownedSkuId);
      if (!profile) throw new DomainError('VALIDATION_ERROR', 'SKU cost profile is missing.');
      const pricingInput = {
        currency: profile.currency,
        costs: profileToEngineCosts(profile),
        goal: input.goal,
        rounding: roundingPolicy('half-up'),
        search: input.search,
      } as const;
      const pricing = calculatePricing(pricingInput);
      const createdAt = now();
      const scenario = createPricingScenario({
        id: idFactory(),
        skuId: ownedSkuId,
        costProfileId: profile.id,
        costProfileRevisionNo: profile.revisionNo,
        name: input.name,
        goalSnapshot: jsonExact(input.goal),
        createdAt,
      });
      const record = createPricingResultRecord({
        id: idFactory(),
        scenarioId: scenario.id,
        skuId: ownedSkuId,
        status: pricing.status,
        inputSnapshot: jsonExact(pricingInput),
        resultSnapshot: jsonExact(pricing),
        engineVersion,
        createdAt: nextTimestamp(createdAt, now()),
      });
      await dependencies.pricing.appendCalculation(scenario, record);
      return { scenario, record, pricing };
    },
    async listHistory(productId, skuId) {
      const ownedSkuId = await ownedSku(productId, skuId);
      const scenarios = await dependencies.pricing.listScenarios(ownedSkuId);
      return Promise.all(
        scenarios.map(async (scenario) => ({
          scenario,
          results: await dependencies.pricing.listResults(scenario.id),
        })),
      );
    },
  };
}

export function profileToEngineCosts(profile: CostProfile): readonly CostItem[] {
  return profile.items.map((item) => toEngineCost(item, profile.currency));
}

function toEngineCost(item: CostProfileItem, currency: string): CostItem {
  const common = {
    key: item.key,
    label: item.label,
    classification: item.classification,
    critical: item.critical,
    status: item.status,
  } as const;
  if (item.kind === 'percentage') {
    return {
      ...common,
      kind: item.kind,
      base: item.percentageBase ?? 'recognized_revenue',
      rateBasisPoints: item.rateBasisPoints === null ? null : BigInt(item.rateBasisPoints),
    };
  }
  if (item.kind === 'formula') {
    return {
      ...common,
      kind: item.kind,
      formula: item.formula === null ? null : FormulaNodeSchema.parse(item.formula),
    };
  }
  return {
    ...common,
    kind: item.kind,
    amount:
      item.amountMinorUnits === null
        ? null
        : moneyFromMinorUnits(BigInt(item.amountMinorUnits), currency),
    allocationUnits: item.allocationUnits === null ? undefined : BigInt(item.allocationUnits),
    unitsPerOrder: item.unitsPerOrder === null ? undefined : BigInt(item.unitsPerOrder),
  };
}

function jsonExact(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonExact);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonExact(child)]));
  }
  return value;
}

function nextTimestamp(previous: Date, current: Date): Date {
  return new Date(Math.max(previous.getTime() + 1, current.getTime()));
}
