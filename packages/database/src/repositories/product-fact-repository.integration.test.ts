import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { confirmProductFact, createProduct, createProductFact, parseUuidV7 } from '@eaw/domain';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzleProductRepository } from './product-repository.js';
import { DrizzleProductFactRepository } from './product-fact-repository.js';

const directories: string[] = [];
const migrationsDirectory = join(process.cwd(), '..', '..', 'migrations');
const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');
const otherProductId = parseUuidV7('0198f0a0-0000-7000-8000-000000000002');

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('DrizzleProductFactRepository', () => {
  it('migrates genuine fact constraints and preserves typed values', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    const created = await facts.create(
      draft('000000000101', 'capacity', { type: 'number', value: 750 }, 'ml'),
    );

    expect(await facts.listCurrent(productId)).toEqual([created]);
    expect(
      database.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_facts'")
        .get(),
    ).toEqual({ name: 'product_facts' });
    expect(() =>
      database.sqlite.exec(
        "INSERT INTO product_facts (id, lineage_id, product_id, fact_key, label, value_type, value_text, source_type, verification, sensitive, policy_eligible, revision_no, is_current, created_at, updated_at) VALUES ('bad','bad','missing','bad','bad','text','x','manual','unverified',0,1,1,1,1,1)",
      ),
    ).toThrow(/FOREIGN KEY/u);
    database.sqlite.exec(`
      INSERT INTO product_fact_lineages (id, product_id, fact_key, created_at) VALUES
        ('0198f0a0-0000-7000-8000-000000000199','${productId}','unsafe_confirmed',1),
        ('0198f0a0-0000-7000-8000-000000000198','${productId}','null_type',1),
        ('0198f0a0-0000-7000-8000-000000000197','${productId}','null_boolean',1),
        ('0198f0a0-0000-7000-8000-000000000196','${productId}','text_unit',1)
    `);
    expect(() =>
      database.sqlite.exec(`
        INSERT INTO product_facts (
          id, lineage_id, product_id, fact_key, label, value_type, value_text, source_type, verification,
          sensitive, policy_eligible, revision_no, is_current, created_at, updated_at, confirmed_at
        ) VALUES (
          '0198f0a0-0000-7000-8000-000000000199', '0198f0a0-0000-7000-8000-000000000199', '${productId}', 'unsafe_confirmed',
          'unsafe', 'text', 'unsafe', 'manual', 'confirmed', 0, 1, 1, 1, 1, 1, 1
        )
      `),
    ).toThrow(/CHECK constraint/u);
    expect(() =>
      database.sqlite.exec(`
        INSERT INTO product_facts (
          id, lineage_id, product_id, fact_key, label, value_type, value_text, unit,
          source_type, verification, sensitive, policy_eligible, revision_no, is_current, created_at, updated_at
        ) VALUES (
          '0198f0a0-0000-7000-8000-000000000196', '0198f0a0-0000-7000-8000-000000000196',
          '${productId}', 'text_unit', 'text unit', 'text', '304不锈钢', 'ml',
          'manual', 'unverified', 0, 1, 1, 1, 1, 1
        )
      `),
    ).toThrow(/CHECK constraint/u);
    expect(() =>
      database.sqlite.exec(`
        INSERT INTO product_facts (
          id, lineage_id, product_id, fact_key, label, value_type, source_type, verification,
          sensitive, policy_eligible, revision_no, is_current, created_at, updated_at
        ) VALUES (
          '0198f0a0-0000-7000-8000-000000000198', '0198f0a0-0000-7000-8000-000000000198', '${productId}', 'null_type',
          'null type', NULL, 'manual', 'unverified', 0, 1, 1, 1, 1, 1
        )
      `),
    ).toThrow(/CHECK constraint/u);
    expect(() =>
      database.sqlite.exec(`
        INSERT INTO product_facts (
          id, lineage_id, product_id, fact_key, label, value_type, value_boolean, source_type, verification,
          sensitive, policy_eligible, revision_no, is_current, created_at, updated_at
        ) VALUES (
          '0198f0a0-0000-7000-8000-000000000197', '0198f0a0-0000-7000-8000-000000000197', '${productId}', 'null_boolean',
          'null boolean', 'boolean', NULL, 'manual', 'unverified', 0, 1, 1, 1, 1, 1
        )
      `),
    ).toThrow(/CHECK constraint/u);
    database.close();
  });

  it('allows exactly one optimistic confirmation and never updates a confirmed row as draft', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    const original = await facts.create(
      draft('000000000101', 'material', { type: 'text', value: '304不锈钢' }),
    );
    const confirmed = confirmProductFact(
      original,
      { actorType: 'user', actorRef: 'local-user', evidenceRef: 'supplier:certificate-1' },
      new Date('2026-08-19T09:00:00.000Z'),
    );

    const results = await Promise.all([
      facts.confirm(confirmed, original.updatedAt),
      facts.confirm(
        {
          ...confirmed,
          confirmation: { ...confirmed.confirmation!, evidenceRef: 'supplier:certificate-2' },
        },
        original.updatedAt,
      ),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await facts.updateDraft({ ...confirmed, label: 'silently changed' }, confirmed.updatedAt),
    ).toBeUndefined();
    expect((await facts.findById(productId, original.id))?.label).toBe('material');
    database.close();
  });

  it('atomically replaces a confirmed current fact with an unconfirmed revision', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    const original = await facts.create(
      draft('000000000101', 'material', { type: 'text', value: '304不锈钢' }),
    );
    const confirmed = confirmProductFact(
      original,
      { actorType: 'user', actorRef: 'local-user', evidenceRef: 'supplier:1' },
      new Date('2026-08-19T09:00:00.000Z'),
    );
    await facts.confirm(confirmed, original.updatedAt);
    const revision = createProductFact({
      ...draftProps('000000000102', 'material', { type: 'text', value: '316不锈钢' }),
      lineageId: original.lineageId,
      revisionNo: 2,
      supersedesFactId: original.id,
      now: new Date('2026-08-19T10:00:00.000Z'),
    });
    await facts.replaceCurrent(confirmed, revision);

    expect(await facts.listCurrent(productId)).toEqual([revision]);
    expect(await facts.findById(productId, original.id)).toEqual(confirmed);
    await expect(
      facts.replaceCurrent(confirmed, {
        ...revision,
        id: parseUuidV7('0198f0a0-0000-7000-8000-000000000103'),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    database.close();
  });

  it('does not expose a fact through a different product owner', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    await products.create(createProduct({ id: otherProductId, name: '水壶', now }));
    const created = await facts.create(
      draft('000000000101', 'material', { type: 'text', value: '304不锈钢' }),
    );
    expect(await facts.findById(otherProductId, created.id)).toBeUndefined();
    database.close();
  });

  it('rejects malformed legacy confirmation and typed-value rows while deserializing', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    const first = await facts.create(
      draft('000000000101', 'material', { type: 'text', value: '304不锈钢' }),
    );
    database.sqlite.exec('PRAGMA ignore_check_constraints = ON;');
    database.sqlite
      .prepare(
        `UPDATE product_facts SET verification='confirmed', confirmed_at=?, confirmation_actor_type=NULL, confirmation_actor_ref='local-user', confirmation_evidence_ref='supplier:1' WHERE id=?`,
      )
      .run(now.getTime(), first.id);
    await expect(facts.findById(productId, first.id)).rejects.toThrow(/confirmation provenance/u);
    database.sqlite
      .prepare(
        `UPDATE product_facts SET verification='unverified', confirmed_at=NULL, confirmation_actor_ref=NULL, confirmation_evidence_ref=NULL, value_type=NULL, value_text=NULL WHERE id=?`,
      )
      .run(first.id);
    await expect(facts.findById(productId, first.id)).rejects.toThrow(/typed value/u);
    database.sqlite
      .prepare(
        `UPDATE product_facts SET verification='confirmed', value_type='text', value_text='304不锈钢', confirmed_at=?, confirmation_actor_type='user', confirmation_actor_ref='local-user', confirmation_evidence_ref='supplier:1' WHERE id=?`,
      )
      .run(now.getTime() + 1, first.id);
    await expect(facts.findById(productId, first.id)).rejects.toThrow(/timestamps/u);
    database.close();
  });

  it('soft-deletes a draft and permits a new lineage to reuse its key at revision one', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    const removed = await facts.create(
      draft('000000000101', 'material', { type: 'text', value: '304不锈钢' }),
    );
    const deletedAt = new Date('2026-08-19T09:00:00.000Z');
    expect(await facts.deleteDraft(productId, removed.id, removed.updatedAt, deletedAt)).toBe(true);
    expect(await facts.listCurrent(productId)).toEqual([]);
    expect(await facts.findById(productId, removed.id)).toBeUndefined();
    expect(
      database.sqlite
        .prepare('SELECT deleted_at, is_current FROM product_facts WHERE id=?')
        .get(removed.id),
    ).toEqual({ deleted_at: deletedAt.getTime(), is_current: 0 });

    const replacement = await facts.create(
      draft('000000000102', 'material', { type: 'text', value: '316不锈钢' }),
    );
    expect(replacement).toMatchObject({ revisionNo: 1, lineageId: replacement.id });
    expect(replacement.lineageId).not.toBe(removed.lineageId);
    database.close();
  });

  it('restores the latest nondeleted revision and counts deleted revisions for continuity', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    const original = await facts.create(
      draft('000000000101', 'material', { type: 'text', value: '304不锈钢' }),
    );
    const confirmed = confirmProductFact(
      original,
      { actorType: 'user', actorRef: 'local-user', evidenceRef: 'supplier:1' },
      new Date('2026-08-19T09:00:00.000Z'),
    );
    await facts.confirm(confirmed, original.updatedAt);
    const revision2 = createProductFact({
      ...draftProps('000000000102', 'material', { type: 'text', value: '316不锈钢' }),
      lineageId: original.lineageId,
      revisionNo: 2,
      supersedesFactId: original.id,
      now: new Date('2026-08-19T10:00:00.000Z'),
    });
    await facts.replaceCurrent(confirmed, revision2);
    await facts.deleteDraft(
      productId,
      revision2.id,
      revision2.updatedAt,
      new Date('2026-08-19T11:00:00.000Z'),
    );

    expect(await facts.listCurrent(productId)).toEqual([confirmed]);
    expect(await facts.maxRevisionNo(productId, original.lineageId)).toBe(2);
    const revision3 = createProductFact({
      ...draftProps('000000000103', 'material', { type: 'text', value: '201不锈钢' }),
      lineageId: original.lineageId,
      revisionNo: 3,
      supersedesFactId: original.id,
      now: new Date('2026-08-19T12:00:00.000Z'),
    });
    await expect(facts.replaceCurrent(confirmed, revision3)).resolves.toEqual(revision3);
    database.close();
  });

  it('serializes deleting a draft and revising the restored confirmed predecessor', async () => {
    const { database, products, facts } = await setup();
    const now = new Date('2026-08-19T08:00:00.000Z');
    await products.create(createProduct({ id: productId, name: '保温杯', now }));
    const original = await facts.create(
      draft('000000000101', 'material', { type: 'text', value: '304不锈钢' }),
    );
    const confirmed = confirmProductFact(
      original,
      { actorType: 'user', actorRef: 'local-user', evidenceRef: 'supplier:1' },
      new Date('2026-08-19T09:00:00.000Z'),
    );
    await facts.confirm(confirmed, original.updatedAt);
    const revision2 = createProductFact({
      ...draftProps('000000000102', 'material', { type: 'text', value: '316不锈钢' }),
      lineageId: original.lineageId,
      revisionNo: 2,
      supersedesFactId: original.id,
      now: new Date('2026-08-19T10:00:00.000Z'),
    });
    await facts.replaceCurrent(confirmed, revision2);
    const revision3 = createProductFact({
      ...draftProps('000000000103', 'material', { type: 'text', value: '201不锈钢' }),
      lineageId: original.lineageId,
      revisionNo: 3,
      supersedesFactId: original.id,
      now: new Date('2026-08-19T12:00:00.000Z'),
    });

    const [deleted, revised] = await Promise.all([
      facts.deleteDraft(
        productId,
        revision2.id,
        revision2.updatedAt,
        new Date('2026-08-19T11:00:00.000Z'),
      ),
      facts.replaceCurrent(confirmed, revision3),
    ]);
    expect(deleted).toBe(true);
    expect(revised).toEqual(revision3);
    expect(await facts.listCurrent(productId)).toEqual([revision3]);
    database.close();
  });
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-facts-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'workspace.sqlite'));
  await migrateDatabase(database, migrationsDirectory);
  return {
    database,
    products: new DrizzleProductRepository(database.drizzle),
    facts: new DrizzleProductFactRepository(database),
  };
}

function draft(
  suffix: string,
  key: string,
  value: { type: 'text'; value: string } | { type: 'number'; value: number },
  unit: string | null = null,
) {
  return createProductFact(draftProps(suffix, key, value, unit));
}

function draftProps(
  suffix: string,
  key: string,
  value: { type: 'text'; value: string } | { type: 'number'; value: number },
  unit: string | null = null,
) {
  return {
    id: parseUuidV7(`0198f0a0-0000-7000-8000-${suffix}`),
    productId,
    key,
    label: key,
    value,
    unit,
    sourceType: 'supplier' as const,
    sourceRef: 'supplier:1',
    verification: 'unverified' as const,
    sensitive: false,
    policyEligible: true,
    now: new Date('2026-08-19T08:00:00.000Z'),
  };
}
