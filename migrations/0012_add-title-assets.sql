CREATE TABLE `title_asset_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `lineage_id` text NOT NULL,
  `product_id` text NOT NULL,
  `platform_id` text NOT NULL,
  `revision_no` integer NOT NULL,
  `origin` text NOT NULL,
  `status` text NOT NULL,
  `locked` integer NOT NULL,
  `titles_json` text NOT NULL,
  `validation_issues_json` text NOT NULL,
  `dependency_hashes_json` text NOT NULL,
  `generation_id` text,
  `supersedes_revision_id` text,
  `created_at` integer NOT NULL,
  CONSTRAINT "title_asset_platform" CHECK(`platform_id` IN ('pinduoduo','taobao','douyin')),
  CONSTRAINT "title_asset_origin" CHECK(`origin` IN ('generated','edited','locked')),
  CONSTRAINT "title_asset_status" CHECK(`status` IN ('verified','needs_review')),
  CONSTRAINT "title_asset_locked" CHECK(`locked` IN (0,1)),
  CONSTRAINT "title_asset_revision" CHECK(`revision_no` >= 1),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`generation_id`) REFERENCES `ai_generations`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`supersedes_revision_id`) REFERENCES `title_asset_revisions`(`id`) ON UPDATE no action ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `title_asset_product_platform_revision` ON `title_asset_revisions` (`product_id`,`platform_id`,`revision_no`);
--> statement-breakpoint
CREATE INDEX `title_asset_history` ON `title_asset_revisions` (`product_id`,`platform_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `title_asset_no_update` BEFORE UPDATE ON `title_asset_revisions`
BEGIN SELECT RAISE(ABORT, 'title asset revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `title_asset_no_delete` BEFORE DELETE ON `title_asset_revisions`
BEGIN SELECT RAISE(ABORT, 'title asset revisions are immutable'); END;
