CREATE TABLE `promotion_scenarios` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `name` text NOT NULL,
  `platform_id` text NOT NULL,
  `region` text NOT NULL,
  `rule_snapshot_id` text NOT NULL,
  `rule_snapshot_hash` text NOT NULL,
  `configuration_snapshot_json` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`rule_snapshot_id`) REFERENCES `rule_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "promotion_scenarios_platform" CHECK(`platform_id` = 'pinduoduo'),
  CONSTRAINT "promotion_scenarios_hash" CHECK(length(`rule_snapshot_hash`) = 64 AND `rule_snapshot_hash` = lower(`rule_snapshot_hash`))
) STRICT;
--> statement-breakpoint
CREATE INDEX `promotion_scenarios_product_created` ON `promotion_scenarios` (`product_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `promotion_results` (
  `id` text PRIMARY KEY NOT NULL,
  `scenario_id` text NOT NULL,
  `sku_id` text NOT NULL,
  `cost_profile_id` text,
  `cost_profile_revision_no` integer,
  `status` text NOT NULL,
  `input_snapshot_json` text NOT NULL,
  `result_snapshot_json` text NOT NULL,
  `engine_version` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`scenario_id`) REFERENCES `promotion_scenarios`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`cost_profile_id`) REFERENCES `cost_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "promotion_results_status" CHECK(`status` IN ('verified','warning','incomplete')),
  CONSTRAINT "promotion_results_cost_reference" CHECK((`cost_profile_id` IS NULL AND `cost_profile_revision_no` IS NULL) OR (`cost_profile_id` IS NOT NULL AND `cost_profile_revision_no` >= 1))
) STRICT;
--> statement-breakpoint
CREATE INDEX `promotion_results_scenario_created` ON `promotion_results` (`scenario_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `promotion_scenarios_no_update` BEFORE UPDATE ON `promotion_scenarios`
BEGIN SELECT RAISE(ABORT, 'promotion scenarios are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `promotion_scenarios_no_delete` BEFORE DELETE ON `promotion_scenarios`
BEGIN SELECT RAISE(ABORT, 'promotion scenarios are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `promotion_results_no_update` BEFORE UPDATE ON `promotion_results`
BEGIN SELECT RAISE(ABORT, 'promotion results are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `promotion_results_no_delete` BEFORE DELETE ON `promotion_results`
BEGIN SELECT RAISE(ABORT, 'promotion results are immutable'); END;
