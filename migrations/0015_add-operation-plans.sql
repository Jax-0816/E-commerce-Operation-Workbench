CREATE TABLE `operation_plan_revisions` (
  `id` text PRIMARY KEY NOT NULL, `lineage_id` text NOT NULL, `product_id` text NOT NULL,
  `platform_id` text NOT NULL, `revision_no` integer NOT NULL, `status` text NOT NULL,
  `workflow_run_id` text NOT NULL, `workflow_run_revision` integer NOT NULL,
  `locked_at` integer, `source_hash` text NOT NULL, `blockers_json` text NOT NULL,
  `supersedes_revision_id` text, `created_at` integer NOT NULL,
  UNIQUE (`lineage_id`,`revision_no`),
  CHECK(`platform_id` IN ('pinduoduo','taobao','douyin')),
  CHECK(`status` IN ('draft','locked')), CHECK(`revision_no` >= 1), CHECK(`workflow_run_revision` >= 1),
  CHECK((`status` = 'draft' AND `locked_at` IS NULL) OR (`status` = 'locked' AND `locked_at` IS NOT NULL)),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE restrict,
  FOREIGN KEY (`supersedes_revision_id`) REFERENCES `operation_plan_revisions`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE INDEX `operation_plan_product_history` ON `operation_plan_revisions` (`product_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TABLE `operation_plan_node_sources` (
  `plan_id` text NOT NULL, `node_order` integer NOT NULL, `node_key` text NOT NULL,
  `asset_type` text NOT NULL, `asset_id` text NOT NULL, `asset_revision_no` integer NOT NULL,
  `dependency_hash` text NOT NULL,
  PRIMARY KEY (`plan_id`,`node_key`), UNIQUE (`plan_id`,`node_order`),
  CHECK(`node_order` BETWEEN 1 AND 6), CHECK(`asset_revision_no` >= 1),
  FOREIGN KEY (`plan_id`) REFERENCES `operation_plan_revisions`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TABLE `operation_plan_competitor_sources` (
  `plan_id` text NOT NULL, `source_order` integer NOT NULL, `snapshot_id` text NOT NULL,
  PRIMARY KEY (`plan_id`,`snapshot_id`), UNIQUE (`plan_id`,`source_order`),
  CHECK(`source_order` >= 1),
  FOREIGN KEY (`plan_id`) REFERENCES `operation_plan_revisions`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TABLE `operation_plan_pricing_sources` (
  `plan_id` text PRIMARY KEY NOT NULL, `result_id` text NOT NULL, `scenario_id` text NOT NULL,
  `sku_id` text NOT NULL, `cost_profile_id` text NOT NULL, `cost_profile_revision_no` integer NOT NULL,
  CHECK(`cost_profile_revision_no` >= 1),
  FOREIGN KEY (`plan_id`) REFERENCES `operation_plan_revisions`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TABLE `operation_plan_promotion_sources` (
  `plan_id` text PRIMARY KEY NOT NULL, `scenario_id` text NOT NULL, `rule_snapshot_hash` text NOT NULL,
  FOREIGN KEY (`plan_id`) REFERENCES `operation_plan_revisions`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TABLE `operation_plan_promotion_results` (
  `plan_id` text NOT NULL, `result_order` integer NOT NULL, `result_id` text NOT NULL,
  PRIMARY KEY (`plan_id`,`result_id`), UNIQUE (`plan_id`,`result_order`),
  CHECK(`result_order` >= 1),
  FOREIGN KEY (`plan_id`) REFERENCES `operation_plan_promotion_sources`(`plan_id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_revisions_no_update` BEFORE UPDATE ON `operation_plan_revisions` BEGIN SELECT RAISE(ABORT, 'operation plan revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_revisions_no_delete` BEFORE DELETE ON `operation_plan_revisions` BEGIN SELECT RAISE(ABORT, 'operation plan revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_nodes_no_update` BEFORE UPDATE ON `operation_plan_node_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_nodes_no_delete` BEFORE DELETE ON `operation_plan_node_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_competitors_no_update` BEFORE UPDATE ON `operation_plan_competitor_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_competitors_no_delete` BEFORE DELETE ON `operation_plan_competitor_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_pricing_no_update` BEFORE UPDATE ON `operation_plan_pricing_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_pricing_no_delete` BEFORE DELETE ON `operation_plan_pricing_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_promotion_no_update` BEFORE UPDATE ON `operation_plan_promotion_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_promotion_no_delete` BEFORE DELETE ON `operation_plan_promotion_sources` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_promotion_results_no_update` BEFORE UPDATE ON `operation_plan_promotion_results` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_plan_promotion_results_no_delete` BEFORE DELETE ON `operation_plan_promotion_results` BEGIN SELECT RAISE(ABORT, 'operation plan sources are immutable'); END;
