import type { FastifyInstance } from 'fastify';

import {
  createFactsApplication,
  createPlatformCapabilitiesApplication,
  createPlatformProfilesApplication,
  createPricingApplication,
  createPromotionApplication,
  createProductsApplication,
  createRulePacksApplication,
  createSkusApplication,
  createAISettingsApplication,
  createCompetitorsApplication,
  createStrategyApplication,
  createTitlesApplication,
  createContentBuildersApplication,
  createContentGenerationPort,
  createContentWorkflowHandlers,
  createRepositoryContentContext,
  createRepositoryContentWorkflowContext,
  createOperationPlansApplication,
  createRepositoryOperationPlanSourceResolver,
  createWorkflowsApplication,
} from '@eaw/application';
import { DeepSeekProvider, type AIProvider } from '@eaw/ai-engine';
import {
  DrizzleProductRepository,
  DrizzleCompetitorRepository,
  DrizzleAIGenerationRepository,
  DrizzleCostProfileRepository,
  DrizzlePricingRepository,
  DrizzlePromotionRepository,
  DrizzleProductFactRepository,
  DrizzlePlatformProfileRepository,
  DrizzleSkuMatrixRepository,
  DrizzleRuleRepository,
  DrizzlePromptRepository,
  DrizzleStrategyRepository,
  DrizzleTitleAssetRepository,
  DrizzleCreativePlanRepository,
  DrizzleDetailPageRepository,
  SqliteWorkflowRepository,
  SqliteOperationPlanRepository,
  migrateDatabase,
  openDatabase,
  recoverInterruptedWorkflows,
  type OpenDatabase,
} from '@eaw/database';
import { createUuidV7 } from '@eaw/domain';
import { APP_VERSION } from '@eaw/shared';
import { contentWorkflowDefinition, createWorkflowRunner } from '@eaw/workflow-engine';
import {
  acquireWorkspaceLock,
  initializeWorkspace,
  resolveWorkspacePath,
  type WorkspaceLock,
  FileSecretStore,
} from '@eaw/workspace';

import { buildApp } from './app.js';
import { createAppContext } from './context.js';
import { ensureStrategyPrompts } from './strategy-prompts.js';

export interface CreateProductionAppOptions {
  readonly migrationsDirectory: string;
  readonly webDistDir?: string;
  readonly workspacePath: string;
  readonly providerFactory?: (apiKey: string) => AIProvider;
}

export async function createProductionApp({
  migrationsDirectory,
  webDistDir,
  workspacePath,
  providerFactory: providerFactoryOverride,
}: CreateProductionAppOptions): Promise<FastifyInstance> {
  const workspace = await initializeWorkspace(workspacePath);
  let lock: WorkspaceLock | undefined;
  let database: OpenDatabase | undefined;
  let cleanedUp = false;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      database?.close();
    } finally {
      await lock?.release();
    }
  };

  try {
    lock = await acquireWorkspaceLock(workspace.path);
    const databasePath = resolveWorkspacePath(workspace.path, 'database/workbench.sqlite');
    database = openDatabase(databasePath);
    await migrateDatabase(database, migrationsDirectory);
    await recoverInterruptedWorkflows(database, new Date());

    const productRepository = new DrizzleProductRepository(database.drizzle);
    const products = createProductsApplication({ repository: productRepository });
    const factRepository = new DrizzleProductFactRepository(database);
    const facts = createFactsApplication({
      repository: factRepository,
      products: productRepository,
    });
    const skuRepository = new DrizzleSkuMatrixRepository(database);
    const skus = createSkusApplication({
      repository: skuRepository,
      products: productRepository,
    });
    const platformProfileRepository = new DrizzlePlatformProfileRepository(database);
    const platformProfiles = createPlatformProfilesApplication({
      repository: platformProfileRepository,
      products: productRepository,
    });
    const platformCapabilities = createPlatformCapabilitiesApplication();
    const costRepository = new DrizzleCostProfileRepository(database);
    const ruleRepository = new DrizzleRuleRepository(database);
    const pricingRepository = new DrizzlePricingRepository(database);
    const pricing = createPricingApplication({
      costs: costRepository,
      pricing: pricingRepository,
      products: productRepository,
      skus: skuRepository,
    });
    const rules = createRulePacksApplication({
      repository: ruleRepository,
      appVersion: APP_VERSION,
      idFactory: createUuidV7,
    });
    const promotionRepository = new DrizzlePromotionRepository(database);
    const promotions = createPromotionApplication({
      costs: costRepository,
      promotions: promotionRepository,
      products: productRepository,
      rules,
      skus: skuRepository,
      idFactory: createUuidV7,
    });
    const secretStore = new FileSecretStore(workspace.path);
    const providerFactory =
      providerFactoryOverride ?? ((apiKey: string) => new DeepSeekProvider({ apiKey }));
    const aiSettings = createAISettingsApplication({
      secrets: secretStore,
      providerFactory,
    });
    const competitorRepository = new DrizzleCompetitorRepository(database);
    const competitors = createCompetitorsApplication({
      products: productRepository,
      repository: competitorRepository,
    });
    const promptRepository = new DrizzlePromptRepository(database);
    await ensureStrategyPrompts(promptRepository);
    const strategyRepository = new DrizzleStrategyRepository(database);
    const generationLogs = new DrizzleAIGenerationRepository(database);
    const strategy = createStrategyApplication({
      products: productRepository,
      facts: factRepository,
      competitors: competitorRepository,
      repository: strategyRepository,
      prompts: promptRepository,
      logs: generationLogs,
      secrets: secretStore,
      providerFactory,
    });
    const titleRepository = new DrizzleTitleAssetRepository(database);
    const titles = createTitlesApplication({
      products: productRepository,
      facts: factRepository,
      strategies: strategyRepository,
      platformProfiles: platformProfileRepository,
      repository: titleRepository,
      prompts: promptRepository,
      logs: generationLogs,
      secrets: secretStore,
      providerFactory,
    });
    const creativeRepository = new DrizzleCreativePlanRepository(database);
    const detailRepository = new DrizzleDetailPageRepository(database);
    const contentBuilders = createContentBuildersApplication({
      products: productRepository,
      creative: creativeRepository,
      detail: detailRepository,
      generation: createContentGenerationPort({
        context: createRepositoryContentContext({
          facts: factRepository,
          strategies: strategyRepository,
          titles: titleRepository,
          platformProfiles: platformProfileRepository,
        }),
        prompts: promptRepository,
        logs: generationLogs,
        secrets: secretStore,
        providerFactory,
      }),
    });
    const workflowRepository = new SqliteWorkflowRepository(database);
    const { handlers: workflowHandlers } = createContentWorkflowHandlers({
      context: createRepositoryContentWorkflowContext({
        facts: factRepository,
        competitors: competitorRepository,
        strategies: strategyRepository,
        titles: titleRepository,
        creativePlans: creativeRepository,
        detailPages: detailRepository,
        platformProfiles: platformProfileRepository,
        prompts: promptRepository,
        rules: ruleRepository,
      }),
      strategies: strategy,
      titles: {
        async generate(productId, platformId) {
          return (await titles.generate(productId, platformId)).revision;
        },
      },
      content: {
        async generateCreative(productId, platformId) {
          return (await contentBuilders.generateCreative(productId, platformId)).revision;
        },
        async generateDetail(productId, platformId) {
          return (await contentBuilders.generateDetail(productId, platformId)).revision;
        },
      },
    });
    const workflowRunner = createWorkflowRunner({
      definition: contentWorkflowDefinition,
      repository: workflowRepository,
      handlers: workflowHandlers,
    });
    const workflows = createWorkflowsApplication({
      products: productRepository,
      competitors: competitorRepository,
      handlers: workflowHandlers,
      repository: workflowRepository,
      runner: workflowRunner,
    });
    const operationPlans = createOperationPlansApplication({
      products: productRepository,
      repository: new SqliteOperationPlanRepository(database),
      resolver: createRepositoryOperationPlanSourceResolver({
        workflows: workflowRepository,
        inspectors: workflowHandlers,
        competitors: competitorRepository,
        strategies: strategyRepository,
        titles: titleRepository,
        creativePlans: creativeRepository,
        detailPages: detailRepository,
        skus: skuRepository,
        pricing: pricingRepository,
        costs: costRepository,
        promotions: promotionRepository,
        rules,
      }),
    });
    const app = buildApp(
      createAppContext({
        aiSettings,
        competitors,
        strategy,
        titles,
        contentBuilders,
        facts,
        platformCapabilities,
        platformProfiles,
        pricing,
        promotions,
        products,
        rules,
        skus,
        webDistDir,
        workflows,
        operationPlans,
      }),
    );
    app.addHook('onClose', cleanup);
    return app;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
