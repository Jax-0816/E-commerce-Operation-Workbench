CREATE TABLE `cost_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `sku_id` text NOT NULL,
  `currency` text NOT NULL,
  `revision_no` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "cost_profiles_currency" CHECK(length(`currency`) = 3 AND `currency` = upper(`currency`)),
  CONSTRAINT "cost_profiles_revision" CHECK(`revision_no` >= 1),
  CONSTRAINT "cost_profiles_time" CHECK(`updated_at` >= `created_at`)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_profiles_sku_unique` ON `cost_profiles` (`sku_id`);
--> statement-breakpoint
CREATE TABLE `cost_profile_items` (
  `profile_id` text NOT NULL,
  `item_key` text NOT NULL,
  `label` text NOT NULL,
  `kind` text NOT NULL,
  `classification` text NOT NULL,
  `critical` integer NOT NULL,
  `status` text NOT NULL,
  `amount_minor_units` text,
  `allocation_units` text,
  `units_per_order` text,
  `rate_basis_points` text,
  `percentage_base` text,
  `formula_json` text,
  PRIMARY KEY (`profile_id`,`item_key`),
  FOREIGN KEY (`profile_id`) REFERENCES `cost_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "cost_items_kind" CHECK(`kind` IN ('fixed','per_order','per_unit','percentage','formula')),
  CONSTRAINT "cost_items_classification" CHECK(`classification` IN ('cost_of_goods','operating')),
  CONSTRAINT "cost_items_critical" CHECK(`critical` IN (0,1)),
  CONSTRAINT "cost_items_status" CHECK(`status` IN ('confirmed','estimated','missing')),
  CONSTRAINT "cost_items_base" CHECK(`percentage_base` IS NULL OR `percentage_base` IN ('campaign_price','consumer_payment','merchant_settlement','recognized_revenue'))
) STRICT;
--> statement-breakpoint
CREATE TABLE `pricing_scenarios` (
  `id` text PRIMARY KEY NOT NULL,
  `sku_id` text NOT NULL,
  `cost_profile_id` text NOT NULL,
  `cost_profile_revision_no` integer NOT NULL,
  `name` text NOT NULL,
  `goal_json` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`cost_profile_id`) REFERENCES `cost_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "pricing_scenarios_revision" CHECK(`cost_profile_revision_no` >= 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `pricing_scenarios_sku_created` ON `pricing_scenarios` (`sku_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `pricing_results` (
  `id` text PRIMARY KEY NOT NULL,
  `scenario_id` text NOT NULL,
  `sku_id` text NOT NULL,
  `status` text NOT NULL,
  `input_snapshot_json` text NOT NULL,
  `result_snapshot_json` text NOT NULL,
  `engine_version` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`scenario_id`) REFERENCES `pricing_scenarios`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "pricing_results_status" CHECK(`status` IN ('verified','warning','incomplete','invalid'))
) STRICT;
--> statement-breakpoint
CREATE INDEX `pricing_results_scenario_created` ON `pricing_results` (`scenario_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `pricing_scenarios_no_update` BEFORE UPDATE ON `pricing_scenarios`
BEGIN SELECT RAISE(ABORT, 'pricing scenarios are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `pricing_scenarios_no_delete` BEFORE DELETE ON `pricing_scenarios`
BEGIN SELECT RAISE(ABORT, 'pricing scenarios are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `pricing_results_no_update` BEFORE UPDATE ON `pricing_results`
BEGIN SELECT RAISE(ABORT, 'pricing results are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `pricing_results_no_delete` BEFORE DELETE ON `pricing_results`
BEGIN SELECT RAISE(ABORT, 'pricing results are immutable'); END;
