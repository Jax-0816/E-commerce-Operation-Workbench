import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { products } from './products.js';

export const productPlatformProfiles = sqliteTable(
  'product_platform_profiles',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    platformId: text('platform_id').notNull(),
    categoryCode: text('category_code'),
    categoryName: text('category_name'),
    externalProductId: text('external_product_id'),
    title: text('title'),
    description: text('description'),
    metadataJson: text('metadata_json').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('platform_profiles_product_platform_unique').on(table.productId, table.platformId),
    uniqueIndex('platform_profiles_identity_product').on(table.id, table.productId),
    index('platform_profiles_product_list').on(table.productId, table.platformId),
    check(
      'platform_profiles_platform',
      sql`${table.platformId} IN ('pinduoduo', 'taobao', 'douyin')`,
    ),
    check('platform_profiles_status', sql`${table.status} IN ('draft', 'ready')`),
    check('platform_profiles_time_order', sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);
