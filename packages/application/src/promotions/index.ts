import { moneyFromMinorUnits, roundingPolicy, type Money } from '@eaw/calculation-engine';
import {
  createPromotionResultRecord,
  createPromotionScenario,
  createUuidV7,
  DomainError,
  parseUuidV7,
  type CostProfileRepository,
  type ProductRepository,
  type PromotionRepository,
  type PromotionResultRecord,
  type PromotionScenario,
  type SkuMatrixRepository,
  type UuidV7,
} from '@eaw/domain';
import {
  calculatePromotion,
  simulatePinduoduo,
  type PinduoduoSimulationResult,
  type PromotionComponent,
} from '@eaw/promotion-engine';

import { profileToEngineCosts } from '../pricing/index.js';
import type { RuleSnapshotRecord } from '../rules/index.js';

export interface CreatePromotionScenarioInput {
  readonly categoryCode: string | null;
  readonly components: readonly PromotionComponent[];
  readonly name: string;
  readonly region: string;
  readonly search: {
    readonly maximumMinorUnits: bigint;
    readonly minimumMinorUnits: bigint;
  };
}

export interface CalculatePromotionRowInput {
  readonly campaignPrice: Money;
  readonly skuId: UuidV7;
}

export interface PromotionBatchRow {
  readonly record: PromotionResultRecord;
  readonly simulation: PinduoduoSimulationResult;
  readonly skuId: UuidV7;
  readonly status: PromotionResultRecord['status'];
}

export interface PromotionApplication {
  calculate(
    scenarioId: string,
    rows: readonly CalculatePromotionRowInput[],
  ): Promise<{ readonly scenario: PromotionScenario; readonly rows: readonly PromotionBatchRow[] }>;
  createScenario(
    productId: string,
    input: CreatePromotionScenarioInput,
  ): Promise<PromotionScenario>;
  list(productId: string): Promise<
    readonly {
      readonly scenario: PromotionScenario;
      readonly results: readonly PromotionResultRecord[];
    }[]
  >;
}

interface RuleSnapshotsPort {
  createSnapshot(input: {
    readonly platformId: 'pinduoduo';
    readonly region: string;
    readonly categoryCode: string | null;
  }): Promise<RuleSnapshotRecord>;
  getSnapshot(id: string): Promise<RuleSnapshotRecord>;
}

export function createPromotionApplication(dependencies: {
  readonly costs: CostProfileRepository;
  readonly engineVersion?: string;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
  readonly products: ProductRepository;
  readonly promotions: PromotionRepository;
  readonly rules: RuleSnapshotsPort;
  readonly skus: SkuMatrixRepository;
}): PromotionApplication {
  const idFactory = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  const engineVersion = dependencies.engineVersion ?? '0.1.0';

  const product = async (value: string) => {
    const id = parseUuidV7(value);
    const found = await dependencies.products.findById(id);
    if (!found || found.archivedAt !== null) {
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    }
    return found;
  };

  return {
    async createScenario(productId, input) {
      const owner = await product(productId);
      const width = input.search.maximumMinorUnits - input.search.minimumMinorUnits;
      if (
        input.components.length === 0 ||
        input.search.minimumMinorUnits < 0n ||
        width < 0n ||
        width > 100_000n ||
        (width + 1n) * BigInt(input.components.length + 5) > 2_000_000n
      ) {
        throw new DomainError('VALIDATION_ERROR', 'Promotion scenario is too large.');
      }
      calculatePromotion({
        campaignPrice: moneyFromMinorUnits(
          input.search.minimumMinorUnits,
          input.components[0]!.threshold.currency,
        ),
        components: input.components,
        rounding: roundingPolicy('half-up'),
      });
      const snapshot = await dependencies.rules.createSnapshot({
        platformId: 'pinduoduo',
        region: input.region,
        categoryCode: input.categoryCode,
      });
      return dependencies.promotions.createScenario(
        createPromotionScenario({
          id: idFactory(),
          productId: owner.id,
          name: input.name,
          platformId: 'pinduoduo',
          region: input.region,
          ruleSnapshotId: parseUuidV7(snapshot.id),
          ruleSnapshotHash: snapshot.snapshot.hash,
          configurationSnapshot: jsonExact({
            components: input.components,
            search: input.search,
          }),
          createdAt: now(),
        }),
      );
    },
    async calculate(scenarioIdValue, rows) {
      const scenarioId = parseUuidV7(scenarioIdValue);
      const scenario = await dependencies.promotions.findScenario(scenarioId);
      if (scenario === undefined) {
        throw new DomainError('NOT_FOUND', 'Promotion scenario was not found.');
      }
      await product(scenario.productId);
      if (
        rows.length === 0 ||
        rows.length > 100 ||
        new Set(rows.map(({ skuId }) => skuId)).size !== rows.length
      ) {
        throw new DomainError('VALIDATION_ERROR', 'Promotion batch rows are invalid.');
      }
      const [matrix, snapshot] = await Promise.all([
        dependencies.skus.load(scenario.productId),
        dependencies.rules.getSnapshot(scenario.ruleSnapshotId),
      ]);
      if (snapshot.snapshot.hash !== scenario.ruleSnapshotHash) {
        throw new DomainError('VALIDATION_ERROR', 'Promotion rule snapshot binding is invalid.');
      }
      const configuration = parseConfiguration(scenario.configurationSnapshot);
      const batchRows: PromotionBatchRow[] = [];
      for (const row of rows) {
        const sku = matrix.skus.find(
          (candidate) => candidate.id === row.skuId && candidate.enabled,
        );
        if (sku === undefined) throw new DomainError('NOT_FOUND', 'SKU was not found.');
        const profile = await dependencies.costs.findBySkuId(sku.id);
        if (profile !== undefined && profile.currency !== row.campaignPrice.currency) {
          throw new DomainError('VALIDATION_ERROR', 'Promotion and cost currencies do not match.');
        }
        const costs =
          profile === undefined
            ? [
                {
                  key: 'cost-profile',
                  label: 'SKU 成本档案',
                  kind: 'per_unit' as const,
                  classification: 'cost_of_goods' as const,
                  critical: true,
                  status: 'missing' as const,
                  amount: null,
                },
              ]
            : profileToEngineCosts(profile);
        const simulation = simulatePinduoduo({
          campaignPrice: row.campaignPrice,
          components: configuration.components,
          costs,
          rounding: roundingPolicy('half-up'),
          ruleSnapshot: snapshot.snapshot,
          search: configuration.search,
        });
        const record = createPromotionResultRecord({
          id: idFactory(),
          scenarioId: scenario.id,
          skuId: sku.id,
          costProfileId: profile?.id ?? null,
          costProfileRevisionNo: profile?.revisionNo ?? null,
          status: simulation.status,
          inputSnapshot: jsonExact({ campaignPrice: row.campaignPrice }),
          resultSnapshot: jsonExact(simulation),
          engineVersion,
          createdAt: now(),
        });
        batchRows.push({ skuId: sku.id, status: simulation.status, simulation, record });
      }
      await dependencies.promotions.appendResults(
        scenario.id,
        batchRows.map(({ record }) => record),
      );
      return { scenario, rows: batchRows };
    },
    async list(productId) {
      const owner = await product(productId);
      const scenarios = await dependencies.promotions.listScenarios(owner.id);
      return Promise.all(
        scenarios.map(async (scenario) => ({
          scenario,
          results: await dependencies.promotions.listResults(scenario.id),
        })),
      );
    },
  };
}

function parseConfiguration(value: unknown): {
  readonly components: readonly PromotionComponent[];
  readonly search: { readonly maximumMinorUnits: bigint; readonly minimumMinorUnits: bigint };
} {
  try {
    const record = object(value);
    const search = object(record.search);
    if (!Array.isArray(record.components)) throw new TypeError();
    return {
      components: record.components.map(parseComponent),
      search: {
        minimumMinorUnits: exactInteger(search.minimumMinorUnits),
        maximumMinorUnits: exactInteger(search.maximumMinorUnits),
      },
    };
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Promotion scenario snapshot is invalid.');
  }
}

function parseComponent(value: unknown): PromotionComponent {
  const input = object(value);
  if (
    typeof input.key !== 'string' ||
    typeof input.kind !== 'string' ||
    !['merchant', 'platform'].includes(String(input.funder)) ||
    !Number.isSafeInteger(input.priority)
  ) {
    throw new TypeError();
  }
  const common = {
    key: input.key,
    funder: input.funder as 'merchant' | 'platform',
    priority: input.priority as number,
    threshold: parseMoney(input.threshold),
  };
  if (input.kind === 'fixed_reduction' || input.kind === 'coupon') {
    return { ...common, kind: input.kind, amount: parseMoney(input.amount) };
  }
  if (input.kind === 'percentage_discount') {
    return {
      ...common,
      kind: input.kind,
      payRateBasisPoints: exactInteger(input.payRateBasisPoints),
      maximumReduction: input.maximumReduction === null ? null : parseMoney(input.maximumReduction),
    };
  }
  throw new TypeError();
}

function parseMoney(value: unknown): Money {
  const input = object(value);
  if (typeof input.currency !== 'string') throw new TypeError();
  return moneyFromMinorUnits(exactInteger(input.minorUnits), input.currency);
}

function exactInteger(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,127})$/u.test(value)) {
    throw new TypeError();
  }
  return BigInt(value);
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new TypeError();
  return value as Record<string, unknown>;
}

function jsonExact(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonExact);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonExact(child)]));
  }
  return value;
}
