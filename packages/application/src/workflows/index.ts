import {
  createUuidV7,
  DomainError,
  parseUuidV7,
  type CompetitorRepository,
  type PlatformId,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';
import {
  contentWorkflowDefinition,
  type CreateWorkflowRunInput,
  type WorkflowEvent,
  type WorkflowNodeOutputReference,
  type WorkflowRepository,
  type WorkflowRun,
  type WorkflowRunner,
} from '@eaw/workflow-engine';

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
  start(productId: string, platformId: PlatformId): Promise<WorkflowRun>;
  list(productId: string): Promise<readonly WorkflowRun[]>;
  get(runId: string): Promise<WorkflowRun>;
  resume(runId: string, expectedRevision: number): Promise<WorkflowRun>;
  retryNode(runId: string, nodeKey: string, expectedRevision: number): Promise<WorkflowRun>;
  cancel(runId: string, expectedRevision: number): Promise<WorkflowRun>;
  listEvents(runId: string, afterSequence: number): Promise<readonly WorkflowEvent[]>;
  subscribe(
    runId: string,
    afterSequence: number,
    listener: WorkflowEventListener,
  ): Promise<() => void>;
}

export interface ApplicationWorkflowRepository extends WorkflowRepository {
  create(input: CreateWorkflowRunInput): Promise<WorkflowRun>;
  listByProduct(productId: UuidV7): Promise<readonly WorkflowRun[]>;
  listEvents(id: UuidV7, afterSequence: number): Promise<readonly WorkflowEvent[]>;
}

export type WorkflowScheduler = (task: () => Promise<void>) => void;
export type WorkflowEventListener = (event: WorkflowEvent) => void;

interface WorkflowSubscription {
  sequence: number;
  readonly listener: WorkflowEventListener;
}

export function createWorkflowsApplication(dependencies: {
  readonly products: ProductRepository;
  readonly competitors: CompetitorRepository;
  readonly handlers: Readonly<Record<string, WorkflowPreflightInspector>>;
  readonly repository?: ApplicationWorkflowRepository;
  readonly runner?: WorkflowRunner;
  readonly idFactory?: (now: Date) => UuidV7;
  readonly now?: () => Date;
  readonly schedule?: WorkflowScheduler;
}): WorkflowsApplication {
  const subscribers = new Map<string, Set<WorkflowSubscription>>();
  const owner = async (value: string): Promise<UuidV7> => {
    const productId = parseUuidV7(value);
    const product = await dependencies.products.findById(productId);
    if (!product || product.archivedAt !== null) {
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    }
    return productId;
  };
  const runtime = () => {
    if (!dependencies.repository || !dependencies.runner) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Workflow runtime is unavailable.');
    }
    return { repository: dependencies.repository, runner: dependencies.runner };
  };
  const ownedRun = async (value: string): Promise<WorkflowRun> => {
    const run = await runtime().repository.findById(parseUuidV7(value));
    if (!run) throw new DomainError('NOT_FOUND', 'Workflow run was not found.');
    await owner(run.productId);
    return run;
  };
  const deliver = (subscription: WorkflowSubscription, events: readonly WorkflowEvent[]): void => {
    for (const event of events) {
      if (event.sequence <= subscription.sequence) continue;
      subscription.sequence = event.sequence;
      try {
        subscription.listener(event);
      } catch {
        // A faulty listener must not block other subscribers or durable execution.
      }
    }
  };
  const publish = async (runId: UuidV7): Promise<void> => {
    const active = subscribers.get(runId);
    if (!active) return;
    for (const subscription of active) {
      deliver(subscription, await runtime().repository.listEvents(runId, subscription.sequence));
    }
  };
  const schedule = (runId: UuidV7, task: () => Promise<unknown>): void => {
    const scheduler = dependencies.schedule ?? ((work) => queueMicrotask(() => void work()));
    scheduler(async () => {
      try {
        await task();
      } catch {
        // Runner failures are durable; background promise failures must remain contained.
      } finally {
        await publish(runId);
      }
    });
  };
  const revisionedRun = async (value: string, expectedRevision: number): Promise<WorkflowRun> => {
    const run = await ownedRun(value);
    if (run.revision !== expectedRevision) {
      throw new DomainError('CONFLICT', 'Workflow revision conflict.');
    }
    return run;
  };
  return {
    async preflight(productIdValue, platformId) {
      const productId = await owner(productIdValue);
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
    async start(productIdValue, platformId) {
      const productId = await owner(productIdValue);
      const { repository, runner } = runtime();
      const now = (dependencies.now ?? (() => new Date()))();
      const run = await repository.create({
        id: (dependencies.idFactory ?? createUuidV7)(now),
        productId,
        platformId,
        definition: contentWorkflowDefinition,
        createdAt: now,
      });
      schedule(run.id, () => runner.run(run.id, run.revision));
      return run;
    },
    async list(productIdValue) {
      const productId = await owner(productIdValue);
      return runtime().repository.listByProduct(productId);
    },
    async get(runIdValue) {
      return ownedRun(runIdValue);
    },
    async resume(runIdValue, expectedRevision) {
      const run = await revisionedRun(runIdValue, expectedRevision);
      schedule(run.id, () => runtime().runner.resume(run.id, expectedRevision));
      return run;
    },
    async retryNode(runIdValue, nodeKey, expectedRevision) {
      const run = await revisionedRun(runIdValue, expectedRevision);
      schedule(run.id, () => runtime().runner.retryNode(run.id, nodeKey, expectedRevision));
      return run;
    },
    async cancel(runIdValue, expectedRevision) {
      const run = await revisionedRun(runIdValue, expectedRevision);
      const cancelled = await runtime().runner.cancel(run.id, expectedRevision);
      await publish(run.id);
      return cancelled;
    },
    async listEvents(runIdValue, afterSequence) {
      const run = await ownedRun(runIdValue);
      return runtime().repository.listEvents(run.id, afterSequence);
    },
    async subscribe(runIdValue, afterSequence, listener) {
      const run = await ownedRun(runIdValue);
      const subscription: WorkflowSubscription = { sequence: afterSequence, listener };
      deliver(subscription, await runtime().repository.listEvents(run.id, afterSequence));
      const active = subscribers.get(run.id) ?? new Set<WorkflowSubscription>();
      active.add(subscription);
      subscribers.set(run.id, active);
      try {
        deliver(subscription, await runtime().repository.listEvents(run.id, subscription.sequence));
      } catch (error) {
        active.delete(subscription);
        throw error;
      }
      return () => {
        active.delete(subscription);
        if (active.size === 0) subscribers.delete(run.id);
      };
    },
  };
}
