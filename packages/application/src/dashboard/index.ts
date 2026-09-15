import { DomainError, PLATFORM_IDS, type PlatformId } from '@eaw/domain';

export type DashboardAttentionCode =
  | 'missing_cost_profiles'
  | 'loss_making_results'
  | 'stale_assets'
  | 'rule_review_required'
  | 'active_rule_pack_missing'
  | 'ai_not_configured';

export interface DashboardAttentionItem {
  readonly code: DashboardAttentionCode;
  readonly severity: 'critical' | 'warning' | 'info';
  readonly count: number;
  readonly label: string;
  readonly explanation: string;
  readonly href: string;
}

export interface DashboardView {
  readonly summary: {
    readonly productCount: number;
    readonly enabledSkuCount: number;
    readonly missingCostProfileCount: number;
    readonly staleAssetCount: number;
    readonly lossMakingResultCount: number;
    readonly ruleRiskCount: number;
  };
  readonly configuration: {
    readonly aiConfigured: boolean;
    readonly pinduoduoRulePackActive: boolean;
  };
  readonly attention: readonly DashboardAttentionItem[];
}

export interface DashboardApplication {
  get(): Promise<DashboardView>;
}

export interface DashboardApplicationDependencies {
  readonly products: {
    list(): Promise<readonly { readonly id: string; readonly archivedAt: Date | null }[]>;
  };
  readonly skus: {
    get(productId: string): Promise<{
      readonly skus: readonly { readonly id: string; readonly enabled: boolean }[];
    }>;
  };
  readonly pricing: {
    getCostProfile(productId: string, skuId: string): Promise<unknown | undefined>;
    listHistory(
      productId: string,
      skuId: string,
    ): Promise<readonly { readonly results: readonly DashboardFinancialResult[] }[]>;
  };
  readonly promotions: {
    list(
      productId: string,
    ): Promise<readonly { readonly results: readonly DashboardFinancialResult[] }[]>;
  };
  readonly rules: {
    list(
      platformId: 'pinduoduo',
      region: 'CN',
    ): Promise<
      readonly {
        readonly active: boolean;
        readonly pack: {
          readonly rules: readonly { readonly status: 'verified' | 'needs_review' }[];
        };
      }[]
    >;
  };
  readonly ai: { get(): Promise<{ readonly configured: boolean }> };
  readonly titles: DashboardAssetReadPort;
  readonly content: {
    listCreative: DashboardAssetReadPort['list'];
    listDetail: DashboardAssetReadPort['list'];
  };
}

interface DashboardFinancialResult {
  readonly skuId: string;
  readonly resultSnapshot: unknown;
  readonly createdAt: Date;
}

interface DashboardAssetReadPort {
  list(
    productId: string,
    platformId: PlatformId,
  ): Promise<
    readonly {
      readonly revision: { readonly createdAt: Date };
      readonly stale: boolean;
    }[]
  >;
}

export function createDashboardApplication(
  dependencies: DashboardApplicationDependencies,
): DashboardApplication {
  return {
    async get() {
      const products = (await dependencies.products.list()).filter(
        ({ archivedAt }) => archivedAt === null,
      );
      let enabledSkuCount = 0;
      let missingCostProfileCount = 0;
      let staleAssetCount = 0;
      let lossMakingResultCount = 0;

      for (const product of products) {
        const matrix = await dependencies.skus.get(product.id);
        const enabledSkus = matrix.skus.filter(({ enabled }) => enabled);
        const enabledSkuIds = new Set(enabledSkus.map(({ id }) => id));
        enabledSkuCount += enabledSkus.length;

        for (const sku of enabledSkus) {
          const [profile, history] = await Promise.all([
            dependencies.pricing.getCostProfile(product.id, sku.id),
            dependencies.pricing.listHistory(product.id, sku.id),
          ]);
          if (profile === undefined) missingCostProfileCount += 1;
          const latest = newest(history.flatMap(({ results }) => results));
          if (latest !== undefined && pricingNetProfit(latest.resultSnapshot) < 0n) {
            lossMakingResultCount += 1;
          }
        }

        const promotions = await dependencies.promotions.list(product.id);
        const promotionResults = promotions
          .flatMap(({ results }) => results)
          .filter(({ skuId }) => enabledSkuIds.has(skuId));
        for (const sku of enabledSkus) {
          const latest = newest(promotionResults.filter(({ skuId }) => skuId === sku.id));
          if (latest !== undefined) {
            const netProfit = promotionNetProfit(latest.resultSnapshot);
            if (netProfit !== null && netProfit < 0n) lossMakingResultCount += 1;
          }
        }

        for (const platformId of PLATFORM_IDS) {
          const [titles, creative, detail] = await Promise.all([
            dependencies.titles.list(product.id, platformId),
            dependencies.content.listCreative(product.id, platformId),
            dependencies.content.listDetail(product.id, platformId),
          ]);
          staleAssetCount += Number(newestView(titles)?.stale === true);
          staleAssetCount += Number(newestView(creative)?.stale === true);
          staleAssetCount += Number(newestView(detail)?.stale === true);
        }
      }

      const [rulePacks, ai] = await Promise.all([
        dependencies.rules.list('pinduoduo', 'CN'),
        dependencies.ai.get(),
      ]);
      const activeRulePack = rulePacks.find(({ active }) => active);
      const ruleRiskCount =
        activeRulePack?.pack.rules.filter(({ status }) => status === 'needs_review').length ?? 0;
      const summary = {
        productCount: products.length,
        enabledSkuCount,
        missingCostProfileCount,
        staleAssetCount,
        lossMakingResultCount,
        ruleRiskCount,
      };
      const configuration = {
        aiConfigured: ai.configured,
        pinduoduoRulePackActive: activeRulePack !== undefined,
      };

      return {
        summary,
        configuration,
        attention: attentionFor(summary, configuration),
      };
    },
  };
}

function newest<T extends { readonly createdAt: Date }>(items: readonly T[]): T | undefined {
  return items.reduce<T | undefined>(
    (latest, candidate) =>
      latest === undefined || candidate.createdAt.getTime() > latest.createdAt.getTime()
        ? candidate
        : latest,
    undefined,
  );
}

function newestView<T extends { readonly revision: { readonly createdAt: Date } }>(
  views: readonly T[],
): T | undefined {
  return views.reduce<T | undefined>(
    (latest, candidate) =>
      latest === undefined ||
      candidate.revision.createdAt.getTime() > latest.revision.createdAt.getTime()
        ? candidate
        : latest,
    undefined,
  );
}

function pricingNetProfit(snapshot: unknown): bigint {
  const root = record(snapshot);
  return netProfit(record(root.outcome));
}

function promotionNetProfit(snapshot: unknown): bigint | null {
  const root = record(snapshot);
  if (root.financial === null) return null;
  return netProfit(record(root.financial));
}

function netProfit(container: Record<string, unknown>): bigint {
  const value = record(container.netProfit).minorUnits;
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)$/u.test(value)) invalidSnapshot();
  try {
    return BigInt(value);
  } catch {
    return invalidSnapshot();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidSnapshot();
  return value as Record<string, unknown>;
}

function invalidSnapshot(): never {
  throw new DomainError('VALIDATION_ERROR', 'Dashboard financial snapshot is invalid.');
}

function attentionFor(
  summary: DashboardView['summary'],
  configuration: DashboardView['configuration'],
): readonly DashboardAttentionItem[] {
  const attention: DashboardAttentionItem[] = [];
  if (summary.missingCostProfileCount > 0) {
    attention.push({
      code: 'missing_cost_profiles',
      severity: 'warning',
      count: summary.missingCostProfileCount,
      label: '补齐 SKU 成本',
      explanation: `有 ${summary.missingCostProfileCount} 个已启用 SKU 尚未设置成本。`,
      href: '/products',
    });
  }
  if (summary.lossMakingResultCount > 0) {
    attention.push({
      code: 'loss_making_results',
      severity: 'critical',
      count: summary.lossMakingResultCount,
      label: '检查亏损结果',
      explanation: `有 ${summary.lossMakingResultCount} 个最新测算结果为亏损。`,
      href: '/products',
    });
  }
  if (summary.staleAssetCount > 0) {
    attention.push({
      code: 'stale_assets',
      severity: 'warning',
      count: summary.staleAssetCount,
      label: '更新过期内容',
      explanation: `有 ${summary.staleAssetCount} 份最新内容资产依赖已变化。`,
      href: '/products',
    });
  }
  if (summary.ruleRiskCount > 0) {
    attention.push({
      code: 'rule_review_required',
      severity: 'warning',
      count: summary.ruleRiskCount,
      label: '审核平台规则',
      explanation: `当前拼多多规则包有 ${summary.ruleRiskCount} 条规则需要人工审核。`,
      href: '/capabilities/rules',
    });
  }
  if (!configuration.pinduoduoRulePackActive) {
    attention.push({
      code: 'active_rule_pack_missing',
      severity: 'critical',
      count: 1,
      label: '启用拼多多规则包',
      explanation: '当前没有启用的拼多多中国区规则包。',
      href: '/capabilities/rules',
    });
  }
  if (!configuration.aiConfigured) {
    attention.push({
      code: 'ai_not_configured',
      severity: 'info',
      count: 1,
      label: '配置 DeepSeek',
      explanation: 'DeepSeek 尚未配置，联网生成能力暂不可用。',
      href: '/capabilities/ai',
    });
  }
  return attention;
}
