CREATE TABLE `product_fact_lineages` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`fact_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_fact_lineages_identity_unique` ON `product_fact_lineages` (`id`,`product_id`,`fact_key`);--> statement-breakpoint
CREATE INDEX `product_fact_lineages_product_key` ON `product_fact_lineages` (`product_id`,`fact_key`);--> statement-breakpoint
CREATE TABLE `product_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`lineage_id` text NOT NULL,
	`product_id` text NOT NULL,
	`fact_key` text NOT NULL,
	`label` text NOT NULL,
	`value_type` text,
	`value_text` text,
	`value_number` real,
	`value_boolean` integer,
	`unit` text,
	`source_type` text NOT NULL,
	`source_ref` text,
	`verification` text NOT NULL,
	`sensitive` integer NOT NULL,
	`policy_eligible` integer NOT NULL,
	`revision_no` integer NOT NULL,
	`supersedes_fact_id` text,
	`is_current` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`confirmed_at` integer,
	`confirmation_actor_type` text,
	`confirmation_actor_ref` text,
	`confirmation_evidence_ref` text,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`lineage_id`,`product_id`,`fact_key`) REFERENCES `product_fact_lineages`(`id`,`product_id`,`fact_key`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_fact_id`,`lineage_id`) REFERENCES `product_facts`(`id`,`lineage_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_facts_revision_lineage" CHECK(("product_facts"."revision_no" = 1 AND "product_facts"."supersedes_fact_id" IS NULL) OR ("product_facts"."revision_no" > 1 AND "product_facts"."supersedes_fact_id" IS NOT NULL AND "product_facts"."supersedes_fact_id" <> "product_facts"."id")),
	CONSTRAINT "product_facts_boolean_flags" CHECK("product_facts"."sensitive" IN (0, 1) AND "product_facts"."policy_eligible" IN (0, 1) AND "product_facts"."is_current" IN (0, 1)),
	CONSTRAINT "product_facts_verification_valid" CHECK("product_facts"."verification" IN ('confirmed','unverified','inferred','missing')),
	CONSTRAINT "product_facts_source_valid" CHECK("product_facts"."source_type" IN ('manual','supplier','import','document','ai_inferred','competitor_reference','other')),
	CONSTRAINT "product_facts_value_shape" CHECK((
      ("product_facts"."verification" = 'missing' AND "product_facts"."value_type" IS NULL AND "product_facts"."value_text" IS NULL AND "product_facts"."value_number" IS NULL AND "product_facts"."value_boolean" IS NULL AND "product_facts"."unit" IS NULL)
      OR ("product_facts"."verification" <> 'missing' AND "product_facts"."value_type" IS NOT NULL AND (
        ("product_facts"."value_type" = 'text' AND "product_facts"."value_text" IS NOT NULL AND length(trim("product_facts"."value_text")) > 0 AND "product_facts"."value_number" IS NULL AND "product_facts"."value_boolean" IS NULL AND "product_facts"."unit" IS NULL)
        OR ("product_facts"."value_type" = 'number' AND "product_facts"."value_text" IS NULL AND "product_facts"."value_number" IS NOT NULL AND "product_facts"."value_boolean" IS NULL)
        OR ("product_facts"."value_type" = 'boolean' AND "product_facts"."value_text" IS NULL AND "product_facts"."value_number" IS NULL AND "product_facts"."value_boolean" IS NOT NULL AND "product_facts"."value_boolean" IN (0,1) AND "product_facts"."unit" IS NULL)
      ))
    )),
	CONSTRAINT "product_facts_unit_nonblank" CHECK("product_facts"."unit" IS NULL OR length(trim("product_facts"."unit")) > 0),
	CONSTRAINT "product_facts_confirmation_shape" CHECK((
      ("product_facts"."verification" = 'confirmed' AND "product_facts"."confirmed_at" IS NOT NULL AND "product_facts"."confirmation_actor_type" IS NOT NULL AND "product_facts"."confirmation_actor_type" = 'user' AND "product_facts"."confirmation_actor_ref" IS NOT NULL AND length(trim("product_facts"."confirmation_actor_ref")) > 0 AND "product_facts"."confirmation_evidence_ref" IS NOT NULL AND length(trim("product_facts"."confirmation_evidence_ref")) > 0)
      OR ("product_facts"."verification" <> 'confirmed' AND "product_facts"."confirmed_at" IS NULL AND "product_facts"."confirmation_actor_type" IS NULL AND "product_facts"."confirmation_actor_ref" IS NULL AND "product_facts"."confirmation_evidence_ref" IS NULL)
    )),
	CONSTRAINT "product_facts_timestamp_order" CHECK("product_facts"."updated_at" >= "product_facts"."created_at" AND ("product_facts"."confirmed_at" IS NULL OR ("product_facts"."confirmed_at" >= "product_facts"."created_at" AND "product_facts"."confirmed_at" <= "product_facts"."updated_at")) AND ("product_facts"."deleted_at" IS NULL OR "product_facts"."deleted_at" >= "product_facts"."updated_at")),
	CONSTRAINT "product_facts_deleted_not_current" CHECK("product_facts"."deleted_at" IS NULL OR "product_facts"."is_current" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_facts_identity_lineage_unique` ON `product_facts` (`id`,`lineage_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_facts_lineage_revision_unique` ON `product_facts` (`lineage_id`,`revision_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_facts_current_key_unique` ON `product_facts` (`product_id`,`fact_key`) WHERE "product_facts"."is_current" = 1 AND "product_facts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `product_facts_active_supersedes_unique` ON `product_facts` (`supersedes_fact_id`) WHERE "product_facts"."supersedes_fact_id" IS NOT NULL AND "product_facts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `product_facts_current_list` ON `product_facts` (`product_id`,`is_current`,`deleted_at`,`fact_key`);