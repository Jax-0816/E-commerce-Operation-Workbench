export { openDatabase, type OpenDatabase } from './client.js';
export { checkIntegrity, type IntegrityCheck } from './health.js';
export { migrateDatabase } from './migrate.js';
export { appMetadata, coreSchema, workspaceSettings } from './schema/core.js';
export { products } from './schema/products.js';
export { DrizzleProductRepository } from './repositories/product-repository.js';
