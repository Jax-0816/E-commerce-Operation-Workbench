CREATE TABLE `rule_packs` (
  `id` text PRIMARY KEY NOT NULL,
  `platform_id` text NOT NULL,
  `region` text NOT NULL,
  `version` text NOT NULL,
  `checksum` text NOT NULL,
  `manifest_json` text NOT NULL,
  `rules_json` text NOT NULL,
  `installed_at` integer NOT NULL,
  `activated_at` integer,
  `active` integer NOT NULL DEFAULT 0,
  CONSTRAINT "rule_packs_platform" CHECK(`platform_id` IN ('pinduoduo','taobao_tmall','douyin_ecommerce')),
  CONSTRAINT "rule_packs_checksum" CHECK(length(`checksum`) = 64 AND `checksum` = lower(`checksum`)),
  CONSTRAINT "rule_packs_active" CHECK(`active` IN (0,1)),
  CONSTRAINT "rule_packs_activation" CHECK((`active` = 0 AND `activated_at` IS NULL) OR (`active` = 1 AND `activated_at` IS NOT NULL))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_packs_version_unique` ON `rule_packs` (`platform_id`,`region`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_packs_checksum_unique` ON `rule_packs` (`checksum`);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_packs_one_active` ON `rule_packs` (`platform_id`,`region`) WHERE `active` = 1;
--> statement-breakpoint
CREATE TABLE `rule_overrides` (
  `id` text PRIMARY KEY NOT NULL,
  `platform_id` text NOT NULL,
  `region` text NOT NULL,
  `rule_key` text NOT NULL,
  `rule_json` text NOT NULL,
  `revision_no` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT "rule_overrides_platform" CHECK(`platform_id` IN ('pinduoduo','taobao_tmall','douyin_ecommerce')),
  CONSTRAINT "rule_overrides_revision" CHECK(`revision_no` >= 1),
  CONSTRAINT "rule_overrides_time" CHECK(`updated_at` >= `created_at`)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_overrides_key_unique` ON `rule_overrides` (`platform_id`,`region`,`rule_key`);
--> statement-breakpoint
CREATE TABLE `rule_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `rule_pack_id` text NOT NULL,
  `platform_id` text NOT NULL,
  `region` text NOT NULL,
  `category_code` text,
  `snapshot_hash` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`rule_pack_id`) REFERENCES `rule_packs`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "rule_snapshots_platform" CHECK(`platform_id` IN ('pinduoduo','taobao_tmall','douyin_ecommerce')),
  CONSTRAINT "rule_snapshots_hash" CHECK(length(`snapshot_hash`) = 64 AND `snapshot_hash` = lower(`snapshot_hash`))
) STRICT;
--> statement-breakpoint
CREATE INDEX `rule_snapshots_context_created` ON `rule_snapshots` (`platform_id`,`region`,`category_code`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `rule_snapshots_no_update` BEFORE UPDATE ON `rule_snapshots`
BEGIN SELECT RAISE(ABORT, 'rule snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `rule_snapshots_no_delete` BEFORE DELETE ON `rule_snapshots`
BEGIN SELECT RAISE(ABORT, 'rule snapshots are immutable'); END;
