import type { PlatformId, StrategyAssetKind, UuidV7 } from '@eaw/domain';
import { canonicalJson, sha256 } from '@eaw/prompt-engine';
import type {
  WorkflowNodeHandler,
  WorkflowNodeInput,
  WorkflowNodeOutputReference,
  WorkflowNodeResult,
} from '@eaw/workflow-engine';

interface GeneratedAsset {
  readonly id: UuidV7;
  readonly revisionNo: number;
  readonly status: 'verified' | 'needs_review';
}

interface GeneratedTitle extends GeneratedAsset {
  readonly locked: boolean;
}

export interface ContentWorkflowContextPort {
  inspect(input: ContentWorkflowInspectionInput): Promise<{
    readonly dependencies: unknown;
    readonly reusableOutput?: WorkflowNodeOutputReference;
  }>;
}

export type ContentWorkflowInspectionInput = Pick<
  WorkflowNodeInput,
  'productId' | 'platformId' | 'nodeKey'
>;

export function createContentWorkflowHandlers(dependencies: {
  readonly context: ContentWorkflowContextPort;
  readonly strategies: {
    generate(
      productId: string,
      kind: StrategyAssetKind,
      workflowDependencyHash?: string,
    ): Promise<GeneratedAsset>;
  };
  readonly titles: {
    generate(
      productId: string,
      platformId: PlatformId,
      workflowDependencyHash?: string,
    ): Promise<GeneratedTitle>;
  };
  readonly content: {
    generateCreative(
      productId: string,
      platformId: PlatformId,
      workflowDependencyHash?: string,
    ): Promise<GeneratedAsset>;
    generateDetail(
      productId: string,
      platformId: PlatformId,
      workflowDependencyHash?: string,
    ): Promise<GeneratedAsset>;
  };
}): { readonly handlers: Readonly<Record<string, WorkflowNodeHandler>> } {
  const create = (
    execute: (input: WorkflowNodeInput) => Promise<WorkflowNodeResult>,
  ): WorkflowNodeHandler => ({
    async inspect(input) {
      const inspection = await dependencies.context.inspect(input);
      return {
        dependencyHash: sha256(canonicalJson(inspection.dependencies)),
        ...(inspection.reusableOutput ? { reusableOutput: inspection.reusableOutput } : {}),
      };
    },
    async execute(input) {
      if (input.signal.aborted) throw input.signal.reason;
      return execute(input);
    },
  });
  const workflowHash = async (input: ContentWorkflowInspectionInput): Promise<string> => {
    const inspection = await dependencies.context.inspect(input);
    return sha256(canonicalJson(inspection.dependencies));
  };
  const strategy = (kind: StrategyAssetKind) =>
    create(async (input) =>
      result(
        kind,
        await dependencies.strategies.generate(input.productId, kind, await workflowHash(input)),
      ),
    );
  return {
    handlers: {
      competitor_analysis: strategy('competitor_analysis'),
      market_insight: strategy('market_insight'),
      selling_point_set: strategy('selling_point_set'),
      title_generation: create(async (input) => {
        const generated = await dependencies.titles.generate(
          input.productId,
          input.platformId,
          await workflowHash(input),
        );
        return result('title_asset', generated, generated.locked ? 'locked' : undefined);
      }),
      creative_plan: create(async (input) =>
        result(
          'creative_plan',
          await dependencies.content.generateCreative(
            input.productId,
            input.platformId,
            await workflowHash(input),
          ),
        ),
      ),
      detail_page: create(async (input) =>
        result(
          'detail_page',
          await dependencies.content.generateDetail(
            input.productId,
            input.platformId,
            await workflowHash(input),
          ),
        ),
      ),
    },
  };
}

function result(
  assetType: string,
  asset: GeneratedAsset,
  forcedStatus?: WorkflowNodeResult['status'],
): WorkflowNodeResult {
  return {
    status: forcedStatus ?? (asset.status === 'needs_review' ? 'needs_review' : 'completed'),
    output: { assetType, assetId: asset.id, revisionNo: asset.revisionNo },
  };
}
