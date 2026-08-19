import {
  DomainError,
  parseUuidV7,
  type FactSourceType,
  type FactValue,
  type FactVerification,
  type ProductFact,
  type ProductFactRepository,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type RawFactRow = Record<string, unknown>;
const sourceTypes = new Set<FactSourceType>([
  'manual',
  'supplier',
  'import',
  'document',
  'ai_inferred',
  'competitor_reference',
  'other',
]);
const verifications = new Set<FactVerification>(['confirmed', 'unverified', 'inferred', 'missing']);

export class DrizzleProductFactRepository implements ProductFactRepository {
  constructor(private readonly database: OpenDatabase) {}

  async create(fact: ProductFact): Promise<ProductFact> {
    if (
      fact.lineageId !== fact.id ||
      fact.revisionNo !== 1 ||
      fact.supersedesFactId !== null ||
      fact.deletedAt !== null
    ) {
      throw new DomainError('CONFLICT', 'A new fact lineage must begin at revision one.');
    }
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      this.database.sqlite
        .prepare(
          'INSERT INTO product_fact_lineages (id, product_id, fact_key, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(fact.lineageId, fact.productId, fact.key, fact.createdAt.getTime());
      insertFact(this.database, fact, true);
      this.database.sqlite.exec('COMMIT;');
      return fact;
    } catch (error) {
      rollback(this.database);
      throw mapWriteError(error);
    }
  }

  async findById(productId: UuidV7, factId: UuidV7): Promise<ProductFact | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM product_facts WHERE product_id = ? AND id = ? AND deleted_at IS NULL')
      .get(productId, factId) as RawFactRow | undefined;
    return row === undefined ? undefined : toFact(row);
  }

  async findCurrentByKey(productId: UuidV7, key: string): Promise<ProductFact | undefined> {
    const row = this.database.sqlite
      .prepare(
        'SELECT * FROM product_facts WHERE product_id = ? AND fact_key = ? AND is_current = 1 AND deleted_at IS NULL',
      )
      .get(productId, key) as RawFactRow | undefined;
    return row === undefined ? undefined : toFact(row);
  }

  async listCurrent(productId: UuidV7): Promise<readonly ProductFact[]> {
    return (
      this.database.sqlite
        .prepare(
          'SELECT * FROM product_facts WHERE product_id = ? AND is_current = 1 AND deleted_at IS NULL ORDER BY fact_key, id',
        )
        .all(productId) as RawFactRow[]
    ).map(toFact);
  }

  async maxRevisionNo(productId: UuidV7, lineageId: UuidV7): Promise<number> {
    const row = this.database.sqlite
      .prepare(
        `
      SELECT MAX(f.revision_no) AS max_revision
      FROM product_facts f JOIN product_fact_lineages l ON l.id = f.lineage_id
      WHERE f.product_id = ? AND f.lineage_id = ? AND l.product_id = ?
    `,
      )
      .get(productId, lineageId, productId) as { max_revision: number | null } | undefined;
    if (row?.max_revision === null || row === undefined)
      throw new DomainError('NOT_FOUND', 'Product fact lineage was not found.');
    return Number(row.max_revision);
  }

  async updateDraft(fact: ProductFact, expectedUpdatedAt: Date): Promise<ProductFact | undefined> {
    if (fact.updatedAt.getTime() <= expectedUpdatedAt.getTime() || fact.deletedAt !== null)
      return undefined;
    const value = valueColumns(fact.value);
    const result = this.database.sqlite
      .prepare(
        `
      UPDATE product_facts SET label=?, value_type=?, value_text=?, value_number=?, value_boolean=?, unit=?,
        source_type=?, source_ref=?, verification=?, sensitive=?, policy_eligible=?, updated_at=?
      WHERE id=? AND product_id=? AND lineage_id=? AND updated_at=? AND verification<>'confirmed'
        AND is_current=1 AND deleted_at IS NULL
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
        fact.lineageId,
        expectedUpdatedAt.getTime(),
      );
    return Number(result.changes) === 1 ? fact : undefined;
  }

  async confirm(fact: ProductFact, expectedUpdatedAt: Date): Promise<ProductFact | undefined> {
    if (fact.updatedAt.getTime() <= expectedUpdatedAt.getTime() || fact.deletedAt !== null)
      return undefined;
    const confirmation = fact.confirmation;
    if (fact.verification !== 'confirmed' || fact.confirmedAt === null || confirmation === null)
      throw new TypeError('Repository confirmation requires valid confirmation provenance.');
    const result = this.database.sqlite
      .prepare(
        `
      UPDATE product_facts SET verification='confirmed', updated_at=?, confirmed_at=?,
        confirmation_actor_type='user', confirmation_actor_ref=?, confirmation_evidence_ref=?
      WHERE id=? AND product_id=? AND lineage_id=? AND updated_at=? AND verification<>'confirmed'
        AND is_current=1 AND deleted_at IS NULL
    `,
      )
      .run(
        fact.updatedAt.getTime(),
        fact.confirmedAt.getTime(),
        confirmation.actorRef,
        confirmation.evidenceRef,
        fact.id,
        fact.productId,
        fact.lineageId,
        expectedUpdatedAt.getTime(),
      );
    return Number(result.changes) === 1 ? fact : undefined;
  }

  async replaceCurrent(previous: ProductFact, next: ProductFact): Promise<ProductFact> {
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const maximum = Number(
        (
          this.database.sqlite
            .prepare(
              'SELECT MAX(revision_no) AS value FROM product_facts WHERE product_id=? AND lineage_id=?',
            )
            .get(previous.productId, previous.lineageId) as { value: number }
        ).value,
      );
      if (
        next.productId !== previous.productId ||
        next.key !== previous.key ||
        next.lineageId !== previous.lineageId ||
        next.revisionNo !== maximum + 1 ||
        next.supersedesFactId !== previous.id ||
        next.verification === 'confirmed' ||
        next.deletedAt !== null ||
        next.createdAt.getTime() <= previous.updatedAt.getTime()
      )
        throw new DomainError('CONFLICT', 'Fact revision lineage is invalid.');
      const retired = this.database.sqlite
        .prepare(
          `
        UPDATE product_facts SET is_current=0
        WHERE id=? AND product_id=? AND lineage_id=? AND is_current=1 AND deleted_at IS NULL
          AND verification='confirmed' AND updated_at=?
      `,
        )
        .run(previous.id, previous.productId, previous.lineageId, previous.updatedAt.getTime());
      if (Number(retired.changes) !== 1)
        throw new DomainError(
          'CONFLICT',
          'Current confirmed fact changed; reload before revising.',
        );
      insertFact(this.database, next, true);
      this.database.sqlite.exec('COMMIT;');
      return next;
    } catch (error) {
      rollback(this.database);
      throw mapWriteError(error);
    }
  }

  async deleteDraft(
    productId: UuidV7,
    factId: UuidV7,
    expectedUpdatedAt: Date,
    deletedAt: Date,
  ): Promise<boolean> {
    if (deletedAt.getTime() <= expectedUpdatedAt.getTime()) return false;
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const row = this.database.sqlite
        .prepare(
          "SELECT lineage_id FROM product_facts WHERE product_id=? AND id=? AND updated_at=? AND verification<>'confirmed' AND is_current=1 AND deleted_at IS NULL",
        )
        .get(productId, factId, expectedUpdatedAt.getTime()) as { lineage_id: string } | undefined;
      if (row === undefined) {
        rollback(this.database);
        return false;
      }
      this.database.sqlite
        .prepare(
          'UPDATE product_facts SET deleted_at=?, is_current=0 WHERE product_id=? AND id=? AND updated_at=? AND is_current=1 AND deleted_at IS NULL',
        )
        .run(deletedAt.getTime(), productId, factId, expectedUpdatedAt.getTime());
      const restore = this.database.sqlite
        .prepare(
          'SELECT id FROM product_facts WHERE product_id=? AND lineage_id=? AND deleted_at IS NULL ORDER BY revision_no DESC LIMIT 1',
        )
        .get(productId, row.lineage_id) as { id: string } | undefined;
      if (restore !== undefined)
        this.database.sqlite
          .prepare(
            'UPDATE product_facts SET is_current=1 WHERE id=? AND is_current=0 AND deleted_at IS NULL',
          )
          .run(restore.id);
      this.database.sqlite.exec('COMMIT;');
      return true;
    } catch (error) {
      rollback(this.database);
      throw mapWriteError(error);
    }
  }
}

function insertFact(database: OpenDatabase, fact: ProductFact, isCurrent: boolean): void {
  const value = valueColumns(fact.value);
  database.sqlite
    .prepare(
      `
    INSERT INTO product_facts (
      id,lineage_id,product_id,fact_key,label,value_type,value_text,value_number,value_boolean,unit,
      source_type,source_ref,verification,sensitive,policy_eligible,revision_no,supersedes_fact_id,
      is_current,created_at,updated_at,confirmed_at,confirmation_actor_type,confirmation_actor_ref,
      confirmation_evidence_ref,deleted_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `,
    )
    .run(
      fact.id,
      fact.lineageId,
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
      fact.deletedAt?.getTime() ?? null,
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
  const verification = row.verification;
  if (typeof verification !== 'string' || !verifications.has(verification as FactVerification))
    throw new TypeError('Persisted fact verification is invalid.');
  const sourceType = row.source_type;
  if (typeof sourceType !== 'string' || !sourceTypes.has(sourceType as FactSourceType))
    throw new TypeError('Persisted fact source is invalid.');
  const unit = nullableNonBlankString(row.unit, 'unit');
  const value = parseValue(row, verification as FactVerification, unit);
  const confirmation = parseConfirmation(row, verification as FactVerification);
  const createdAt = dateValue(row.created_at, 'created_at');
  const updatedAt = dateValue(row.updated_at, 'updated_at');
  const confirmedAt =
    verification === 'confirmed' ? dateValue(row.confirmed_at, 'confirmed_at') : null;
  const deletedAt = nullableDate(row.deleted_at, 'deleted_at');
  if (
    updatedAt < createdAt ||
    (confirmedAt !== null && (confirmedAt < createdAt || confirmedAt > updatedAt)) ||
    (deletedAt !== null && deletedAt < updatedAt)
  )
    throw new TypeError('Persisted fact timestamps are invalid.');
  const isCurrent = booleanValue(row.is_current, 'is_current');
  if (deletedAt !== null && isCurrent)
    throw new TypeError('Persisted deleted fact cannot be current.');
  return {
    id: parseUuidV7(stringValue(row.id, 'id')),
    lineageId: parseUuidV7(stringValue(row.lineage_id, 'lineage_id')),
    productId: parseUuidV7(stringValue(row.product_id, 'product_id')),
    key: nonBlankString(row.fact_key, 'fact_key'),
    label: nonBlankString(row.label, 'label'),
    value,
    unit,
    sourceType: sourceType as FactSourceType,
    sourceRef: nullableString(row.source_ref, 'source_ref'),
    verification: verification as FactVerification,
    sensitive: booleanValue(row.sensitive, 'sensitive'),
    policyEligible: booleanValue(row.policy_eligible, 'policy_eligible'),
    revisionNo: positiveInteger(row.revision_no, 'revision_no'),
    supersedesFactId:
      row.supersedes_fact_id === null
        ? null
        : parseUuidV7(stringValue(row.supersedes_fact_id, 'supersedes_fact_id')),
    createdAt,
    updatedAt,
    confirmedAt,
    confirmation,
    deletedAt,
  };
}

function parseValue(
  row: RawFactRow,
  verification: FactVerification,
  unit: string | null,
): FactValue | null {
  const type = row.value_type;
  if (verification === 'missing') {
    if (
      type !== null ||
      row.value_text !== null ||
      row.value_number !== null ||
      row.value_boolean !== null ||
      unit !== null
    )
      throw new TypeError('Persisted fact typed value is invalid.');
    return null;
  }
  if (
    type === 'text' &&
    typeof row.value_text === 'string' &&
    row.value_text.trim() !== '' &&
    row.value_number === null &&
    row.value_boolean === null &&
    unit === null
  )
    return { type, value: row.value_text };
  if (
    type === 'number' &&
    typeof row.value_number === 'number' &&
    Number.isFinite(row.value_number) &&
    row.value_text === null &&
    row.value_boolean === null
  )
    return { type, value: row.value_number };
  if (
    type === 'boolean' &&
    (row.value_boolean === 0 || row.value_boolean === 1) &&
    row.value_text === null &&
    row.value_number === null &&
    unit === null
  )
    return { type, value: row.value_boolean === 1 };
  throw new TypeError('Persisted fact typed value is invalid.');
}

function parseConfirmation(
  row: RawFactRow,
  verification: FactVerification,
): ProductFact['confirmation'] {
  if (verification !== 'confirmed') {
    if (
      row.confirmed_at !== null ||
      row.confirmation_actor_type !== null ||
      row.confirmation_actor_ref !== null ||
      row.confirmation_evidence_ref !== null
    )
      throw new TypeError('Persisted fact confirmation provenance is invalid.');
    return null;
  }
  if (
    row.confirmation_actor_type !== 'user' ||
    typeof row.confirmation_actor_ref !== 'string' ||
    row.confirmation_actor_ref.trim() === '' ||
    typeof row.confirmation_evidence_ref !== 'string' ||
    row.confirmation_evidence_ref.trim() === ''
  )
    throw new TypeError('Persisted fact confirmation provenance is invalid.');
  dateValue(row.confirmed_at, 'confirmed_at');
  return {
    actorType: 'user',
    actorRef: row.confirmation_actor_ref,
    evidenceRef: row.confirmation_evidence_ref,
  };
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`Persisted fact ${field} is invalid.`);
  return value;
}
function nonBlankString(value: unknown, field: string): string {
  const result = stringValue(value, field);
  if (result.trim() === '') throw new TypeError(`Persisted fact ${field} is invalid.`);
  return result;
}
function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : stringValue(value, field);
}
function nullableNonBlankString(value: unknown, field: string): string | null {
  return value === null ? null : nonBlankString(value, field);
}
function dateValue(value: unknown, field: string): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`Persisted fact ${field} is invalid.`);
  return new Date(value);
}
function nullableDate(value: unknown, field: string): Date | null {
  return value === null ? null : dateValue(value, field);
}
function booleanValue(value: unknown, field: string): boolean {
  if (value !== 0 && value !== 1) throw new TypeError(`Persisted fact ${field} is invalid.`);
  return value === 1;
}
function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`Persisted fact ${field} is invalid.`);
  return value;
}
function bool(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}
function rollback(database: OpenDatabase): void {
  try {
    database.sqlite.exec('ROLLBACK;');
  } catch {
    /* no active transaction */
  }
}
function mapWriteError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message))
    return new DomainError('CONFLICT', 'Fact key, lineage, or revision already exists.');
  return error;
}
