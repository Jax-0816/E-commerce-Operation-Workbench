CREATE TABLE `workflow_runs` (
  `id` text PRIMARY KEY NOT NULL, `product_id` text NOT NULL, `platform_id` text NOT NULL,
  `definition_json` text NOT NULL, `status` text NOT NULL, `revision` integer NOT NULL,
  `cancellation_requested` integer NOT NULL DEFAULT 0, `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK(`platform_id` IN ('pinduoduo','taobao','douyin')),
  CHECK(`status` IN ('not_started','running','completed','failed','interrupted','cancelled')),
  CHECK(`revision` >= 1), CHECK(`cancellation_requested` IN (0,1)),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE INDEX `workflow_runs_product_created` ON `workflow_runs` (`product_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TABLE `workflow_nodes` (
  `workflow_run_id` text NOT NULL, `node_key` text NOT NULL, `task_type` text NOT NULL,
  `node_order` integer NOT NULL, `status` text NOT NULL, `dependency_hash` text,
  `output_json` text, `error_json` text, `claimed_at` integer,
  PRIMARY KEY (`workflow_run_id`,`node_key`),
  UNIQUE (`workflow_run_id`,`node_order`),
  CHECK(`node_order` >= 1),
  CHECK(`status` IN ('not_started','running','completed','failed','stale','locked','needs_review','cancelled')),
  FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TABLE `workflow_attempts` (
  `workflow_run_id` text NOT NULL, `node_key` text NOT NULL, `attempt_no` integer NOT NULL,
  `dependency_hash` text NOT NULL, `status` text NOT NULL, `started_at` integer NOT NULL,
  `finished_at` integer, `error_json` text,
  PRIMARY KEY (`workflow_run_id`,`node_key`,`attempt_no`),
  CHECK(`attempt_no` >= 1), CHECK(`status` IN ('running','completed','failed','cancelled')),
  FOREIGN KEY (`workflow_run_id`,`node_key`) REFERENCES `workflow_nodes`(`workflow_run_id`,`node_key`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TABLE `workflow_events` (
  `workflow_run_id` text NOT NULL, `event_sequence` integer NOT NULL, `event_type` text NOT NULL,
  `run_revision` integer NOT NULL, `node_key` text, `payload_json` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`workflow_run_id`,`event_sequence`),
  CHECK(`event_sequence` >= 1), CHECK(`run_revision` >= 1),
  FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON DELETE restrict
) STRICT;
--> statement-breakpoint
CREATE TRIGGER `workflow_attempts_no_update` BEFORE UPDATE ON `workflow_attempts`
BEGIN SELECT RAISE(ABORT, 'workflow attempts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workflow_attempts_no_delete` BEFORE DELETE ON `workflow_attempts`
BEGIN SELECT RAISE(ABORT, 'workflow attempts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workflow_events_no_update` BEFORE UPDATE ON `workflow_events`
BEGIN SELECT RAISE(ABORT, 'workflow events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workflow_events_no_delete` BEFORE DELETE ON `workflow_events`
BEGIN SELECT RAISE(ABORT, 'workflow events are immutable'); END;
