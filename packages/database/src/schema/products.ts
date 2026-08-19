import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    activeName: text('active_name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('products_active_name_unique')
      .on(table.activeName)
      .where(sql`${table.archivedAt} IS NULL`),
    index('products_active_list_order').on(table.archivedAt, table.createdAt, table.id),
  ],
);
