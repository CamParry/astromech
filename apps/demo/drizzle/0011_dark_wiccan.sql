CREATE TABLE `plugin_backups_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`size_bytes` integer,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`artifact_deleted_at` integer
);
