import {
  DomainError,
  type FactSourceType,
  type FactValue,
  type FactVerification,
  type ProductFact,
  type ProductFactRepository,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type RawFactRow = Record<string, unknown>;

export class DrizzleProductFactRepository implements ProductFactRepository {
  constructor(private readonly database: OpenDatabase) {}

  async create(fact: ProductFact): Promise<ProductFact> {
    try {
      insertFact(this.database, fact, true);
      return fact;
    } catch (error) {
      throw mapWriteError(error);
    }
  }

  async findById(productId: UuidV7, factId: UuidV7): Promise<ProductFact | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM product_facts WHERE product_id = ? AND id = ?')
      .get(productId, factId) as RawFactRow | undefined;
    return row === undefined ? undefined : toFact(row);
  }

  async findCurrentByKey(productId: UuidV7, key: string): Promise<ProductFact | undefined> {
    const row = this.database.sqlite
      .prepare(
        'SELECT * FROM product_facts WHERE product_id = ? AND fact_key = ? AND is_current = 1',
      )
      .get(productId, key) as RawFactRow | undefined;
    return row === undefined ? undefined : toFact(row);
  }

  async listCurrent(productId: UuidV7): Promise<readonly ProductFact[]> {
    return (
      this.database.sqlite
        .prepare(
          'SELECT * FROM product_facts WHERE product_id = ? AND is_current = 1 ORDER BY fact_key, id',
        )
        .all(productId) as RawFactRow[]
    ).map(toFact);
  }

  async updateDraft(fact: ProductFact, expectedUpdatedAt: Date): Promise<ProductFact | undefined> {
    if (fact.updatedAt.getTime() <= expectedUpdatedAt.getTime()) return undefined;
    const value = valueColumns(fact.value);
    const result = this.database.sqlite
      .prepare(
        `
      UPDATE product_facts SET
        label = ?, value_type = ?, value_text = ?, value_number = ?, value_boolean = ?, unit = ?,
        source_type = ?, source_ref = ?, verification = ?, sensitive = ?, policy_eligible = ?, updated_at = ?
      WHERE id = ? AND product_id = ? AND updated_at = ? AND verification <> 'confirmed' AND is_current = 1
    `,
      )
      .run(
        fact.label,
        value.type,
        value.text,
        value.number,
        value.boolean,
        fact.unit,
        fact.sourceType,
        fact.sourceRef,
        fact.verification,
        bool(fact.sensitive),
        bool(fact.policyEligible),
        fact.updatedAt.getTime(),
        fact.id,
        fact.productId,
        expectedUpdatedAt.getTime(),
      );
    return Number(result.changes) === 1 ? fact : undefined;
  }

  async confirm(fact: ProductFact, expectedUpdatedAt: Date): Promise<ProductFact | undefined> {
    if (fact.updatedAt.getTime() <= expectedUpdatedAt.getTime()) return undefined;
    const confirmation = fact.confirmation;
    if (fact.verification !== 'confirmed' || fact.confirmedAt === null || confirmation === null) {
      throw new TypeError('Repository confirmation requires a confirmed domain fact.');
    }
    const result = this.database.sqlite
      .prepare(
        `
      UPDATE product_facts SET verification = 'confirmed', updated_at = ?, confirmed_at = ?,
        confirmation_actor_type = 'user', confirmation_actor_ref = ?, confirmation_evidence_ref = ?
      WHERE id = ? AND product_id = ? AND updated_at = ? AND verification <> 'confirmed' AND is_current = 1
    `,
      )
      .run(
        fact.updatedAt.getTime(),
        fact.confirmedAt.getTime(),
        confirmation.actorRef,
        confirmation.evidenceRef,
        fact.id,
        fact.productId,
        expectedUpdatedAt.getTime(),
      );
    return Number(result.changes) === 1 ? fact : undefined;
  }

  async replaceCurrent(previous: ProductFact, next: ProductFact): Promise<ProductFact> {
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const retired = this.database.sqlite
        .prepare(
          `
        UPDATE product_facts SET is_current = 0
        WHERE id = ? AND product_id = ? AND fact_key = ? AND revision_no = ?
          AND is_current = 1 AND verification = 'confirmed' AND updated_at = ?
      `,
        )
        .run(
          previous.id,
          previous.productId,
          previous.key,
          previous.revisionNo,
          previous.updatedAt.getTime(),
        );
      if (Number(retired.changes) !== 1) {
        throw new DomainError(
          'CONFLICT',
          'Current confirmed fact changed; reload before revising.',
        );
      }
      if (
        next.productId !== previous.productId ||
        next.key !== previous.key ||
        next.revisionNo !== previous.revisionNo + 1 ||
        next.supersedesFactId !== previous.id ||
        next.verification === 'confirmed' ||
        next.createdAt.getTime() <= previous.updatedAt.getTime()
      ) {
        throw new DomainError('CONFLICT', 'Fact revision lineage is invalid.');
      }
      insertFact(this.database, next, true);
      this.database.sqlite.exec('COMMIT;');
      return next;
    } catch (error) {
      this.database.sqlite.exec('ROLLBACK;');
      throw mapWriteError(error);
    }
  }

  async deleteDraft(productId: UuidV7, factId: UuidV7, expectedUpdatedAt: Date): Promise<boolean> {
    const result = this.database.sqlite
      .prepare(
        `
      DELETE FROM product_facts
      WHERE product_id = ? AND id = ? AND updated_at = ? AND verification <> 'confirmed' AND is_current = 1
    `,
      )
      .run(productId, factId, expectedUpdatedAt.getTime());
    return Number(result.changes) === 1;
  }
}

function insertFact(database: OpenDatabase, fact: ProductFact, isCurrent: boolean): void {
  const value = valueColumns(fact.value);
  database.sqlite
    .prepare(
      `
    INSERT INTO product_facts (
      id, product_id, fact_key, label, value_type, value_text, value_number, value_boolean, unit,
      source_type, source_ref, verification, sensitive, policy_eligible, revision_no, supersedes_fact_id,
      is_current, created_at, updated_at, confirmed_at, confirmation_actor_type,
      confirmation_actor_ref, confirmation_evidence_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      fact.id,
      fact.productId,
      fact.key,
      fact.label,
      value.type,
      value.text,
      value.number,
      value.boolean,
      fact.unit,
      fact.sourceType,
      fact.sourceRef,
      fact.verification,
      bool(fact.sensitive),
      bool(fact.policyEligible),
      fact.revisionNo,
      fact.supersedesFactId,
      bool(isCurrent),
      fact.createdAt.getTime(),
      fact.updatedAt.getTime(),
      fact.confirmedAt?.getTime() ?? null,
      fact.confirmation?.actorType ?? null,
      fact.confirmation?.actorRef ?? null,
      fact.confirmation?.evidenceRef ?? null,
    );
}

function valueColumns(value: FactValue | null) {
  return {
    type: value?.type ?? null,
    text: value?.type === 'text' ? value.value : null,
    number: value?.type === 'number' ? value.value : null,
    boolean: value?.type === 'boolean' ? bool(value.value) : null,
  };
}

function toFact(row: RawFactRow): ProductFact {
  const valueType = row.value_type as FactValue['type'] | null;
  const value: FactValue | null =
    valueType === null
      ? null
      : valueType === 'text'
        ? { type: 'text', value: String(row.value_text) }
        : valueType === 'number'
          ? { type: 'number', value: Number(row.value_number) }
          : { type: 'boolean', value: Number(row.value_boolean) === 1 };
  const confirmed = row.verification === 'confirmed';
  return {
    id: row.id as UuidV7,
    productId: row.product_id as UuidV7,
    key: String(row.fact_key),
    label: String(row.label),
    value,
    unit: row.unit === null ? null : String(row.unit),
    sourceType: row.source_type as FactSourceType,
    sourceRef: row.source_ref === null ? null : String(row.source_ref),
    verification: row.verification as FactVerification,
    sensitive: Number(row.sensitive) === 1,
    policyEligible: Number(row.policy_eligible) === 1,
    revisionNo: Number(row.revision_no),
    supersedesFactId: row.supersedes_fact_id as UuidV7 | null,
    createdAt: new Date(Number(row.created_at)),
    updatedAt: new Date(Number(row.updated_at)),
    confirmedAt: confirmed ? new Date(Number(row.confirmed_at)) : null,
    confirmation: confirmed
      ? {
          actorType: 'user',
          actorRef: String(row.confirmation_actor_ref),
          evidenceRef: String(row.confirmation_evidence_ref),
        }
      : null,
  };
}

function bool(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function mapWriteError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) {
    return new DomainError('CONFLICT', 'Fact key or revision already exists.');
  }
  return error;
}
