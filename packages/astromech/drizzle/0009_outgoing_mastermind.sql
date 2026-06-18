CREATE TABLE `_astromech_cron` (
	`name` text PRIMARY KEY NOT NULL,
	`schedule` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run` integer,
	`next_run` integer,
	`lock` integer
);
