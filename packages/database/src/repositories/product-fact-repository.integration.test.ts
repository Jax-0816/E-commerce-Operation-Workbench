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
        "INSERT INTO product_facts (id, product_id, fact_key, label, value_type, value_text, source_type, verification, sensitive, policy_eligible, revision_no, is_current, created_at, updated_at) VALUES ('bad','missing','bad','bad','text','x','manual','unverified',0,1,1,1,1,1)",
      ),
    ).toThrow(/FOREIGN KEY/u);
    expect(() =>
      database.sqlite.exec(`
        INSERT INTO product_facts (
          id, product_id, fact_key, label, value_type, value_text, source_type, verification,
          sensitive, policy_eligible, revision_no, is_current, created_at, updated_at, confirmed_at
        ) VALUES (
          '0198f0a0-0000-7000-8000-000000000199', '${productId}', 'unsafe_confirmed',
          'unsafe', 'text', 'unsafe', 'manual', 'confirmed', 0, 1, 1, 1, 1, 1, 1
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
