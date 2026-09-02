CREATE TABLE `prompt_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `template_id` text NOT NULL,
  `task` text NOT NULL,
  `version` text NOT NULL,
  `template_hash` text NOT NULL,
  `template_json` text NOT NULL,
  `installed_at` integer NOT NULL,
  CONSTRAINT "prompt_templates_hash" CHECK(length(`template_hash`) = 64 AND `template_hash` = lower(`template_hash`))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_templates_version_unique` ON `prompt_templates` (`template_id`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_templates_hash_unique` ON `prompt_templates` (`template_hash`);
--> statement-breakpoint
CREATE TABLE `prompt_activations` (
  `template_id` text PRIMARY KEY NOT NULL,
  `prompt_template_id` text NOT NULL UNIQUE,
  `activated_at` integer NOT NULL,
  FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON UPDATE no action ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TRIGGER `prompt_templates_no_update` BEFORE UPDATE ON `prompt_templates`
BEGIN SELECT RAISE(ABORT, 'prompt templates are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `prompt_templates_no_delete` BEFORE DELETE ON `prompt_templates`
BEGIN SELECT RAISE(ABORT, 'prompt templates are immutable'); END;
