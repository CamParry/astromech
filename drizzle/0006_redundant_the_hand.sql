CREATE TABLE `plugin_redirects_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`from` text NOT NULL,
	`to` text NOT NULL,
	`status` text DEFAULT '301' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DELETE FROM `entries` WHERE `type` = 'redirect';
