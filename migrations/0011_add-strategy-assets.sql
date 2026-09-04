CREATE TABLE `strategy_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `kind` text NOT NULL,
  `revision_no` integer NOT NULL,
  `generation_id` text NOT NULL UNIQUE,
  `status` text NOT NULL,
  `payload_json` text NOT NULL,
  `supersedes_asset_id` text,
  `created_at` integer NOT NULL,
  CONSTRAINT "strategy_assets_kind" CHECK(`kind` IN ('competitor_analysis','market_insight','selling_point_set')),
  CONSTRAINT "strategy_assets_status" CHECK(`status` IN ('verified','needs_review')),
  CONSTRAINT "strategy_assets_revision" CHECK(`revision_no` >= 1),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`generation_id`) REFERENCES `ai_generations`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`supersedes_asset_id`) REFERENCES `strategy_assets`(`id`) ON UPDATE no action ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `strategy_assets_product_kind_revision` ON `strategy_assets` (`product_id`,`kind`,`revision_no`);
--> statement-breakpoint
CREATE INDEX `strategy_assets_product_kind_created` ON `strategy_assets` (`product_id`,`kind`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `strategy_assets_no_update` BEFORE UPDATE ON `strategy_assets`
BEGIN SELECT RAISE(ABORT, 'strategy assets are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `strategy_assets_no_delete` BEFORE DELETE ON `strategy_assets`
BEGIN SELECT RAISE(ABORT, 'strategy assets are immutable'); END;
