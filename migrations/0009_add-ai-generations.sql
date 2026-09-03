CREATE TABLE `ai_generations` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `task` text NOT NULL,
  `prompt_template_id` text NOT NULL,
  `prompt_version` text NOT NULL,
  `input_hash` text NOT NULL,
  `request_json` text NOT NULL,
  `raw_response` text,
  `parsed_response_json` text NOT NULL,
  `status` text NOT NULL,
  `error` text,
  `input_tokens` integer NOT NULL,
  `output_tokens` integer NOT NULL,
  `started_at` integer NOT NULL,
  `finished_at` integer NOT NULL,
  CONSTRAINT "ai_generations_hash" CHECK(length(`input_hash`) = 64 AND `input_hash` = lower(`input_hash`)),
  CONSTRAINT "ai_generations_status" CHECK(`status` IN ('verified','needs_review','failed')),
  CONSTRAINT "ai_generations_tokens" CHECK(`input_tokens` >= 0 AND `output_tokens` >= 0),
  CONSTRAINT "ai_generations_times" CHECK(`finished_at` >= `started_at`),
  FOREIGN KEY (`prompt_template_id`,`prompt_version`) REFERENCES `prompt_templates`(`template_id`,`version`) ON UPDATE no action ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_generations_task_started` ON `ai_generations` (`task`,`started_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `ai_generations_no_update` BEFORE UPDATE ON `ai_generations`
BEGIN SELECT RAISE(ABORT, 'ai generations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `ai_generations_no_delete` BEFORE DELETE ON `ai_generations`
BEGIN SELECT RAISE(ABORT, 'ai generations are immutable'); END;
