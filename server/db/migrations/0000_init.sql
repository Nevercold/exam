CREATE TABLE `api_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`oauth_client_id` text,
	`refresh_token_hash` text,
	`refresh_expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_tokenHash_unique` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_refreshTokenHash_unique` ON `api_token` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `api_token_user_idx` ON `api_token` (`user_id`);--> statement-breakpoint
CREATE TABLE `exam` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`draft` text NOT NULL,
	`draft_updated_at` integer NOT NULL,
	`draft_updated_via` text DEFAULT 'editor' NOT NULL,
	`released` text,
	`released_at` integer,
	`shared_with_colleagues` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exam_owner_idx` ON `exam` (`owner_id`);--> statement-breakpoint
CREATE TABLE `invite` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_code` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `run` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`started_by` text NOT NULL,
	`pin` text NOT NULL,
	`snapshot` text NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`exam_id`) REFERENCES `exam`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`started_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_pin_idx` ON `run` (`pin`);--> statement-breakpoint
CREATE INDEX `run_exam_idx` ON `run` (`exam_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);