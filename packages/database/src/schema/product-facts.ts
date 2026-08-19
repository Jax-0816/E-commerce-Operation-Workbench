import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { products } from './products.js';

export const productFactLineages = sqliteTable(
  'product_fact_lineages',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    key: text('fact_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('product_fact_lineages_identity_unique').on(table.id, table.productId, table.key),
    index('product_fact_lineages_product_key').on(table.productId, table.key),
  ],
);

export const productFacts = sqliteTable(
  'product_facts',
  {
    id: text('id').primaryKey(),
    lineageId: text('lineage_id').notNull(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    key: text('fact_key').notNull(),
    label: text('label').notNull(),
    valueType: text('value_type', { enum: ['text', 'number', 'boolean'] }),
    valueText: text('value_text'),
    valueNumber: real('value_number'),
    valueBoolean: integer('value_boolean', { mode: 'boolean' }),
    unit: text('unit'),
    sourceType: text('source_type', {
      enum: [
        'manual',
        'supplier',
        'import',
        'document',
        'ai_inferred',
        'competitor_reference',
        'other',
      ],
    }).notNull(),
    sourceRef: text('source_ref'),
    verification: text('verification', {
      enum: ['confirmed', 'unverified', 'inferred', 'missing'],
    }).notNull(),
    sensitive: integer('sensitive', { mode: 'boolean' }).notNull(),
    policyEligible: integer('policy_eligible', { mode: 'boolean' }).notNull(),
    revisionNo: integer('revision_no').notNull(),
    supersedesFactId: text('supersedes_fact_id'),
    isCurrent: integer('is_current', { mode: 'boolean' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
    confirmationActorType: text('confirmation_actor_type', { enum: ['user'] }),
    confirmationActorRef: text('confirmation_actor_ref'),
    confirmationEvidenceRef: text('confirmation_evidence_ref'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    foreignKey({
      name: 'product_facts_lineage_owner_fk',
      columns: [table.lineageId, table.productId, table.key],
      foreignColumns: [
        productFactLineages.id,
        productFactLineages.productId,
        productFactLineages.key,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'product_facts_supersedes_lineage_fk',
      columns: [table.supersedesFactId, table.lineageId],
      foreignColumns: [table.id, table.lineageId],
    }).onDelete('restrict'),
    uniqueIndex('product_facts_identity_lineage_unique').on(table.id, table.lineageId),
    uniqueIndex('product_facts_lineage_revision_unique').on(table.lineageId, table.revisionNo),
    uniqueIndex('product_facts_current_key_unique')
      .on(table.productId, table.key)
      .where(sql`${table.isCurrent} = 1 AND ${table.deletedAt} IS NULL`),
    uniqueIndex('product_facts_active_supersedes_unique')
      .on(table.supersedesFactId)
      .where(sql`${table.supersedesFactId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    index('product_facts_current_list').on(
      table.productId,
      table.isCurrent,
      table.deletedAt,
      table.key,
    ),
    check(
      'product_facts_revision_lineage',
      sql`(${table.revisionNo} = 1 AND ${table.supersedesFactId} IS NULL) OR (${table.revisionNo} > 1 AND ${table.supersedesFactId} IS NOT NULL AND ${table.supersedesFactId} <> ${table.id})`,
    ),
    check(
      'product_facts_boolean_flags',
      sql`${table.sensitive} IN (0, 1) AND ${table.policyEligible} IN (0, 1) AND ${table.isCurrent} IN (0, 1)`,
    ),
    check(
      'product_facts_verification_valid',
      sql`${table.verification} IN ('confirmed','unverified','inferred','missing')`,
    ),
    check(
      'product_facts_source_valid',
      sql`${table.sourceType} IN ('manual','supplier','import','document','ai_inferred','competitor_reference','other')`,
    ),
    check(
      'product_facts_value_shape',
      sql`(
      (${table.verification} = 'missing' AND ${table.valueType} IS NULL AND ${table.valueText} IS NULL AND ${table.valueNumber} IS NULL AND ${table.valueBoolean} IS NULL AND ${table.unit} IS NULL)
      OR (${table.verification} <> 'missing' AND ${table.valueType} IS NOT NULL AND (
        (${table.valueType} = 'text' AND ${table.valueText} IS NOT NULL AND length(trim(${table.valueText})) > 0 AND ${table.valueNumber} IS NULL AND ${table.valueBoolean} IS NULL AND ${table.unit} IS NULL)
        OR (${table.valueType} = 'number' AND ${table.valueText} IS NULL AND ${table.valueNumber} IS NOT NULL AND ${table.valueBoolean} IS NULL)
        OR (${table.valueType} = 'boolean' AND ${table.valueText} IS NULL AND ${table.valueNumber} IS NULL AND ${table.valueBoolean} IS NOT NULL AND ${table.valueBoolean} IN (0,1) AND ${table.unit} IS NULL)
      ))
    )`,
    ),
    check(
      'product_facts_unit_nonblank',
      sql`${table.unit} IS NULL OR length(trim(${table.unit})) > 0`,
    ),
    check(
      'product_facts_confirmation_shape',
      sql`(
      (${table.verification} = 'confirmed' AND ${table.confirmedAt} IS NOT NULL AND ${table.confirmationActorType} IS NOT NULL AND ${table.confirmationActorType} = 'user' AND ${table.confirmationActorRef} IS NOT NULL AND length(trim(${table.confirmationActorRef})) > 0 AND ${table.confirmationEvidenceRef} IS NOT NULL AND length(trim(${table.confirmationEvidenceRef})) > 0)
      OR (${table.verification} <> 'confirmed' AND ${table.confirmedAt} IS NULL AND ${table.confirmationActorType} IS NULL AND ${table.confirmationActorRef} IS NULL AND ${table.confirmationEvidenceRef} IS NULL)
    )`,
    ),
    check(
      'product_facts_timestamp_order',
      sql`${table.updatedAt} >= ${table.createdAt} AND (${table.confirmedAt} IS NULL OR (${table.confirmedAt} >= ${table.createdAt} AND ${table.confirmedAt} <= ${table.updatedAt})) AND (${table.deletedAt} IS NULL OR ${table.deletedAt} >= ${table.updatedAt})`,
    ),
    check(
      'product_facts_deleted_not_current',
      sql`${table.deletedAt} IS NULL OR ${table.isCurrent} = 0`,
    ),
  ],
);
