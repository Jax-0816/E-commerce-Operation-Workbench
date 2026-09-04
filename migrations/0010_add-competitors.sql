CREATE TABLE `competitor_import_batches` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `source` text NOT NULL,
  `source_name` text NOT NULL,
  `snapshot_count` integer NOT NULL,
  `imported_at` integer NOT NULL,
  CONSTRAINT "competitor_batches_source" CHECK(`source` IN ('manual','paste','csv','xlsx','url')),
  CONSTRAINT "competitor_batches_count" CHECK(`snapshot_count` > 0 AND `snapshot_count` <= 1000),
  CONSTRAINT "competitor_batches_product_unique" UNIQUE(`id`,`product_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TABLE `competitors` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `name` text NOT NULL,
  `source_url` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `archived_at` integer,
  CONSTRAINT "competitors_product_unique" UNIQUE(`id`,`product_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE INDEX `competitors_product_created` ON `competitors` (`product_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `competitor_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `competitor_id` text NOT NULL,
  `product_id` text NOT NULL,
  `import_batch_id` text NOT NULL,
  `source` text NOT NULL,
  `source_url` text,
  `displayed_price_text` text,
  `normalized_price_minor_units` text,
  `displayed_sales_text` text,
  `normalized_sales_json` text,
  `displayed_review_text` text,
  `normalized_reviews_json` text,
  `sku_texts_json` text NOT NULL,
  `selling_points_json` text NOT NULL,
  `image_references_json` text NOT NULL,
  `raw_payload_json` text NOT NULL,
  `captured_at` integer NOT NULL,
  `imported_at` integer NOT NULL,
  CONSTRAINT "competitor_snapshots_source" CHECK(`source` IN ('manual','paste','csv','xlsx','url')),
  FOREIGN KEY (`competitor_id`,`product_id`) REFERENCES `competitors`(`id`,`product_id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`import_batch_id`,`product_id`) REFERENCES `competitor_import_batches`(`id`,`product_id`) ON UPDATE no action ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE INDEX `competitor_snapshots_competitor_captured` ON `competitor_snapshots` (`competitor_id`,`captured_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `competitor_import_batches_no_update` BEFORE UPDATE ON `competitor_import_batches`
BEGIN SELECT RAISE(ABORT, 'competitor import batches are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `competitor_import_batches_no_delete` BEFORE DELETE ON `competitor_import_batches`
BEGIN SELECT RAISE(ABORT, 'competitor import batches are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `competitor_snapshots_no_update` BEFORE UPDATE ON `competitor_snapshots`
BEGIN SELECT RAISE(ABORT, 'competitor snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `competitor_snapshots_no_delete` BEFORE DELETE ON `competitor_snapshots`
BEGIN SELECT RAISE(ABORT, 'competitor snapshots are immutable'); END;
