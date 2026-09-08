import {
  DomainError,
  parseUuidV7,
  type CompetitorRepository,
  type PlatformId,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';
import { contentWorkflowDefinition, type WorkflowNodeOutputReference } from '@eaw/workflow-engine';

export interface WorkflowPreflightInspection {
  readonly dependencyHash: string;
  readonly reusableOutput?: WorkflowNodeOutputReference;
}

export interface WorkflowPreflightInspector {
  inspect(input: {
    readonly productId: UuidV7;
    readonly platformId: PlatformId;
    readonly nodeKey: string;
  }): Promise<WorkflowPreflightInspection>;
  execute(...input: readonly unknown[]): Promise<unknown>;
}

export interface WorkflowPreflightNode extends WorkflowPreflightInspection {
  readonly key: string;
  readonly taskType: string;
  readonly order: number;
  readonly runnable: boolean;
  readonly missingInputs: readonly string[];
}

export interface WorkflowPreflight {
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly productId: UuidV7;
  readonly platformId: PlatformId;
  readonly nodes: readonly WorkflowPreflightNode[];
}

export interface WorkflowsApplication {
  preflight(productId: string, platformId: PlatformId): Promise<WorkflowPreflight>;
}

export function createWorkflowsApplication(dependencies: {
  readonly products: ProductRepository;
  readonly competitors: CompetitorRepository;
  readonly handlers: Readonly<Record<string, WorkflowPreflightInspector>>;
}): WorkflowsApplication {
  return {
    async preflight(productIdValue, platformId) {
      const productId = parseUuidV7(productIdValue);
      const product = await dependencies.products.findById(productId);
      if (!product || product.archivedAt !== null) {
        throw new DomainError('NOT_FOUND', 'Product was not found.');
      }
      const competitors = await dependencies.competitors.listByProduct(productId);
      const nodes: WorkflowPreflightNode[] = [];
      for (const definition of contentWorkflowDefinition.nodes) {
        const handler = dependencies.handlers[definition.taskType];
        if (!handler) {
          throw new DomainError('CAPABILITY_UNAVAILABLE', 'Workflow handler is unavailable.');
        }
        const inspection = await handler.inspect({
          productId,
          platformId,
          nodeKey: definition.key,
        });
        if (!/^[a-f0-9]{64}$/u.test(inspection.dependencyHash)) {
          throw new DomainError('VALIDATION_ERROR', 'Workflow dependency hash is invalid.');
        }
        const missingInputs =
          definition.key === 'competitor_analysis' && competitors.length === 0
            ? ['competitor_snapshot']
            : [];
        nodes.push({
          ...inspection,
          key: definition.key,
          taskType: definition.taskType,
          order: definition.order,
          runnable: missingInputs.length === 0,
          missingInputs,
        });
      }
      return {
        definitionId: contentWorkflowDefinition.definitionId,
        definitionVersion: contentWorkflowDefinition.version,
        productId,
        platformId,
        nodes,
      };
    },
  };
}
