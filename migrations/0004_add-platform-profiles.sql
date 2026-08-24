CREATE TABLE `product_platform_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`platform_id` text NOT NULL,
	`category_code` text,
	`category_name` text,
	`external_product_id` text,
	`title` text,
	`description` text,
	`metadata_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "platform_profiles_platform" CHECK("product_platform_profiles"."platform_id" IN ('pinduoduo', 'taobao', 'douyin')),
	CONSTRAINT "platform_profiles_status" CHECK("product_platform_profiles"."status" IN ('draft', 'ready')),
	CONSTRAINT "platform_profiles_time_order" CHECK("product_platform_profiles"."updated_at" >= "product_platform_profiles"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_profiles_product_platform_unique` ON `product_platform_profiles` (`product_id`,`platform_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_profiles_identity_product` ON `product_platform_profiles` (`id`,`product_id`);--> statement-breakpoint
CREATE INDEX `platform_profiles_product_list` ON `product_platform_profiles` (`product_id`,`platform_id`);