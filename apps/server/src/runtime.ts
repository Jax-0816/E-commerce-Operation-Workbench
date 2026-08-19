import type { FastifyInstance } from 'fastify';

import { createFactsApplication, createProductsApplication } from '@eaw/application';
import {
  DrizzleProductRepository,
  DrizzleProductFactRepository,
  migrateDatabase,
  openDatabase,
  type OpenDatabase,
} from '@eaw/database';
import {
  acquireWorkspaceLock,
  initializeWorkspace,
  resolveWorkspacePath,
  type WorkspaceLock,
} from '@eaw/workspace';

import { buildApp } from './app.js';
import { createAppContext } from './context.js';

export interface CreateProductionAppOptions {
  readonly migrationsDirectory: string;
  readonly webDistDir?: string;
  readonly workspacePath: string;
}

export async function createProductionApp({
  migrationsDirectory,
  webDistDir,
  workspacePath,
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

    const productRepository = new DrizzleProductRepository(database.drizzle);
    const products = createProductsApplication({ repository: productRepository });
    const facts = createFactsApplication({
      repository: new DrizzleProductFactRepository(database),
      products: productRepository,
    });
    const app = buildApp(createAppContext({ facts, products, webDistDir }));
    app.addHook('onClose', cleanup);
    return app;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
