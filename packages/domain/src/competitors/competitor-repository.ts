import type { UuidV7 } from '../ids.js';
import type { Competitor, CompetitorImportSource, CompetitorSnapshot } from './competitor.js';

export interface CompetitorImportBatch {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly source: CompetitorImportSource;
  readonly sourceName: string;
  readonly snapshotCount: number;
  readonly importedAt: Date;
}

export interface CompetitorImportEntry {
  readonly competitor: Competitor;
  readonly snapshot: CompetitorSnapshot;
}

export interface CompetitorWithLatestSnapshot {
  readonly competitor: Competitor;
  readonly latestSnapshot: CompetitorSnapshot;
}

export interface CompetitorRepository {
  importBatch(
    batch: CompetitorImportBatch,
    entries: readonly CompetitorImportEntry[],
  ): Promise<readonly CompetitorImportEntry[]>;
  findCompetitor(id: UuidV7): Promise<Competitor | undefined>;
  listByProduct(productId: UuidV7): Promise<readonly CompetitorWithLatestSnapshot[]>;
  listSnapshots(competitorId: UuidV7): Promise<readonly CompetitorSnapshot[]>;
}
