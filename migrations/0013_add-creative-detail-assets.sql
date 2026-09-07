CREATE TABLE `creative_plan_revisions` (
  `id` text PRIMARY KEY NOT NULL, `lineage_id` text NOT NULL, `product_id` text NOT NULL,
  `platform_id` text NOT NULL, `revision_no` integer NOT NULL, `origin` text NOT NULL,
  `status` text NOT NULL, `items_json` text NOT NULL, `dependency_hashes_json` text NOT NULL,
  `validation_issues_json` text NOT NULL, `generation_id` text, `supersedes_revision_id` text,
  `created_at` integer NOT NULL,
  CHECK(`platform_id` IN ('pinduoduo','taobao','douyin')),
  CHECK(`origin` IN ('generated','regenerated_item','locked_item','reordered')),
  CHECK(`status` IN ('verified','needs_review')), CHECK(`revision_no` >= 1),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE restrict,
  FOREIGN KEY (`generation_id`) REFERENCES `ai_generations`(`id`) ON DELETE restrict,
  FOREIGN KEY (`supersedes_revision_id`) REFERENCES `creative_plan_revisions`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `creative_plan_product_platform_revision` ON `creative_plan_revisions` (`product_id`,`platform_id`,`revision_no`);
--> statement-breakpoint
CREATE TRIGGER `creative_plan_no_update` BEFORE UPDATE ON `creative_plan_revisions`
BEGIN SELECT RAISE(ABORT, 'creative plan revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `creative_plan_no_delete` BEFORE DELETE ON `creative_plan_revisions`
BEGIN SELECT RAISE(ABORT, 'creative plan revisions are immutable'); END;
--> statement-breakpoint
CREATE TABLE `detail_page_revisions` (
  `id` text PRIMARY KEY NOT NULL, `lineage_id` text NOT NULL, `product_id` text NOT NULL,
  `platform_id` text NOT NULL, `revision_no` integer NOT NULL, `origin` text NOT NULL,
  `status` text NOT NULL, `sections_json` text NOT NULL, `dependency_hashes_json` text NOT NULL,
  `validation_issues_json` text NOT NULL, `generation_id` text, `supersedes_revision_id` text,
  `created_at` integer NOT NULL,
  CHECK(`platform_id` IN ('pinduoduo','taobao','douyin')),
  CHECK(`origin` IN ('generated','locked_section','reordered')),
  CHECK(`status` IN ('verified','needs_review')), CHECK(`revision_no` >= 1),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE restrict,
  FOREIGN KEY (`generation_id`) REFERENCES `ai_generations`(`id`) ON DELETE restrict,
  FOREIGN KEY (`supersedes_revision_id`) REFERENCES `detail_page_revisions`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `detail_page_product_platform_revision` ON `detail_page_revisions` (`product_id`,`platform_id`,`revision_no`);
--> statement-breakpoint
CREATE TRIGGER `detail_page_no_update` BEFORE UPDATE ON `detail_page_revisions`
BEGIN SELECT RAISE(ABORT, 'detail page revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `detail_page_no_delete` BEFORE DELETE ON `detail_page_revisions`
BEGIN SELECT RAISE(ABORT, 'detail page revisions are immutable'); END;
