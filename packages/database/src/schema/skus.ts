import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { products } from './products.js';
export const specificationDimensions = sqliteTable(
  'specification_dimensions',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    uniqueIndex('spec_dimensions_product_name').on(t.productId, t.name),
    uniqueIndex('spec_dimensions_identity_product').on(t.id, t.productId),
    check('spec_dimensions_position', sql`${t.position} >= 0`),
  ],
);
export const specificationValues = sqliteTable(
  'specification_values',
  {
    id: text('id').primaryKey(),
    dimensionId: text('dimension_id').notNull(),
    productId: text('product_id').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'spec_values_dimension_product_fk',
      columns: [t.dimensionId, t.productId],
      foreignColumns: [specificationDimensions.id, specificationDimensions.productId],
    }).onDelete('cascade'),
    uniqueIndex('spec_values_dimension_label').on(t.dimensionId, t.label),
    uniqueIndex('spec_values_identity_product').on(t.id, t.productId),
    check('spec_values_position', sql`${t.position} >= 0`),
  ],
);
export const skus = sqliteTable(
  'skus',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    signature: text('signature').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    internalCode: text('internal_code'),
    externalCode: text('external_code'),
    barcode: text('barcode'),
    weightGrams: integer('weight_grams'),
  },
  (t) => [
    uniqueIndex('skus_product_signature').on(t.productId, t.signature),
    uniqueIndex('skus_identity_product').on(t.id, t.productId),
    index('skus_product_enabled').on(t.productId, t.enabled),
    check('skus_enabled_boolean', sql`${t.enabled} IN (0, 1)`),
    check('skus_weight', sql`${t.weightGrams} IS NULL OR ${t.weightGrams} >= 0`),
  ],
);
export const skuValues = sqliteTable(
  'sku_values',
  {
    skuId: text('sku_id')
      .notNull()
      .references(() => skus.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    valueId: text('value_id').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'sku_values_sku_product_fk',
      columns: [t.skuId, t.productId],
      foreignColumns: [skus.id, skus.productId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'sku_values_value_product_fk',
      columns: [t.valueId, t.productId],
      foreignColumns: [specificationValues.id, specificationValues.productId],
    }).onDelete('restrict'),
    uniqueIndex('sku_values_sku_position').on(t.skuId, t.position),
    uniqueIndex('sku_values_sku_value').on(t.skuId, t.valueId),
    check('sku_values_position', sql`${t.position} >= 0`),
  ],
);
