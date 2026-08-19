CREATE TABLE `sku_values` (
	`sku_id` text NOT NULL,
	`product_id` text NOT NULL,
	`value_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sku_id`,`product_id`) REFERENCES `skus`(`id`,`product_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`,`product_id`) REFERENCES `specification_values`(`id`,`product_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sku_values_position" CHECK("sku_values"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sku_values_sku_position` ON `sku_values` (`sku_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `sku_values_sku_value` ON `sku_values` (`sku_id`,`value_id`);--> statement-breakpoint
CREATE TABLE `skus` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`signature` text NOT NULL,
	`enabled` integer NOT NULL,
	`internal_code` text,
	`external_code` text,
	`barcode` text,
	`weight_grams` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "skus_enabled_boolean" CHECK("skus"."enabled" IN (0, 1)),
	CONSTRAINT "skus_weight" CHECK("skus"."weight_grams" IS NULL OR "skus"."weight_grams" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skus_product_signature` ON `skus` (`product_id`,`signature`);--> statement-breakpoint
CREATE UNIQUE INDEX `skus_identity_product` ON `skus` (`id`,`product_id`);--> statement-breakpoint
CREATE INDEX `skus_product_enabled` ON `skus` (`product_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `specification_dimensions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "spec_dimensions_position" CHECK("specification_dimensions"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spec_dimensions_product_name` ON `specification_dimensions` (`product_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `spec_dimensions_identity_product` ON `specification_dimensions` (`id`,`product_id`);--> statement-breakpoint
CREATE TABLE `specification_values` (
	`id` text PRIMARY KEY NOT NULL,
	`dimension_id` text NOT NULL,
	`product_id` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`dimension_id`,`product_id`) REFERENCES `specification_dimensions`(`id`,`product_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "spec_values_position" CHECK("specification_values"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spec_values_dimension_label` ON `specification_values` (`dimension_id`,`label`);--> statement-breakpoint
CREATE UNIQUE INDEX `spec_values_identity_product` ON `specification_values` (`id`,`product_id`);