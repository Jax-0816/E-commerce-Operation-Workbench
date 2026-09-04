import type { UuidV7 } from '../ids.js';
import type {
  StrategyAsset,
  StrategyAssetKind,
  StrategyAssetPayload,
  StrategyAssetStatus,
} from './strategy-asset.js';

export interface AppendStrategyAssetInput {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly kind: StrategyAssetKind;
  readonly generationId: UuidV7;
  readonly status: StrategyAssetStatus;
  readonly payload: StrategyAssetPayload;
  readonly createdAt: Date;
}

export interface StrategyRepository {
  append(input: AppendStrategyAssetInput): Promise<StrategyAsset>;
  latest(productId: UuidV7, kind: StrategyAssetKind): Promise<StrategyAsset | undefined>;
  list(productId: UuidV7, kind: StrategyAssetKind): Promise<readonly StrategyAsset[]>;
}
