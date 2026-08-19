CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_active_name_unique` ON `products` (`active_name`) WHERE "products"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX `products_active_list_order` ON `products` (`archived_at`,`created_at`,`id`);