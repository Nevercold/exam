-- Runs get a waiting state: started_at becomes nullable, created_at + duration_minutes are new.
-- Hand-written table rebuild (portable SQLite; drizzle-kit generated libSQL-only ALTER COLUMN).
-- Existing runs were started on creation: created_at = started_at; duration derived from the timer.
CREATE TABLE `__new_run` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`started_by` text NOT NULL,
	`pin` text NOT NULL,
	`snapshot` text NOT NULL,
	`duration_minutes` integer,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ends_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`exam_id`) REFERENCES `exam`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`started_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_run` (`id`, `exam_id`, `started_by`, `pin`, `snapshot`, `duration_minutes`, `created_at`, `started_at`, `ends_at`, `ended_at`)
SELECT `id`, `exam_id`, `started_by`, `pin`, `snapshot`,
	CASE WHEN `ends_at` IS NULL THEN NULL ELSE (`ends_at` - `started_at`) / 60 END,
	`started_at`, `started_at`, `ends_at`, `ended_at`
FROM `run`;
--> statement-breakpoint
DROP TABLE `run`;
--> statement-breakpoint
ALTER TABLE `__new_run` RENAME TO `run`;
--> statement-breakpoint
CREATE INDEX `run_pin_idx` ON `run` (`pin`);
--> statement-breakpoint
CREATE INDEX `run_exam_idx` ON `run` (`exam_id`);
