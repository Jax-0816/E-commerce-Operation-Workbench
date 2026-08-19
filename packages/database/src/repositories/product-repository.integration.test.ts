import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createProduct } from '@eaw/domain';
import { parseUuidV7 } from '@eaw/domain';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzleProductRepository } from './product-repository.js';

const directories: string[] = [];
const migrationsDirectory = join(process.cwd(), '..', '..', 'migrations');

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('DrizzleProductRepository', () => {
  it('allows one concurrent active-name writer and permits reuse after archive', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eaw-products-'));
    directories.push(directory);
    const database = openDatabase(join(directory, 'workspace.sqlite'));
    await migrateDatabase(database, migrationsDirectory);
    const repository = new DrizzleProductRepository(database.drizzle);
    const now = new Date('2026-08-19T08:00:00.000Z');
    const first = createProduct({
      id: parseUuidV7('0198f0a0-0000-7000-8000-000000000001'),
      name: '保温杯',
      now,
    });

    const second = { ...first, id: parseUuidV7('0198f0a0-0000-7000-8000-000000000002') };
    const concurrentResults = await Promise.allSettled([
      repository.create(first),
      repository.create(second),
    ]);
    expect(concurrentResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrentResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winner = concurrentResults.find(
      (result): result is PromiseFulfilledResult<typeof first> => result.status === 'fulfilled',
    )!.value;
    await repository.archive(winner.id, new Date('2026-08-19T09:00:00.000Z'));
    await expect(
      repository.create({ ...first, id: parseUuidV7('0198f0a0-0000-7000-8000-000000000003') }),
    ).resolves.toMatchObject({ name: '保温杯' });
    database.close();
  });
});
