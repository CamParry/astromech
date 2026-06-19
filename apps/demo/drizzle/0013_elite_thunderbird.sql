PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`locale` text NOT NULL,
	`locale_group` text NOT NULL,
	`slug` text,
	`title` text NOT NULL,
	`fields` text,
	`status` text DEFAULT 'unpublished' NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_entries`("id", "type", "locale", "locale_group", "slug", "title", "fields", "status", "published_at", "deleted_at", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "type", "locale", "locale_group", "slug", "title", "fields", "status", "published_at", "deleted_at", "created_at", "updated_at", "created_by", "updated_by" FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `__new_entries` RENAME TO `entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_entries_type` ON `entries` (`type`);--> statement-breakpoint
CREATE INDEX `idx_entries_status` ON `entries` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entries_locale` ON `entries` (`type`,`locale`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entries_deleted` ON `entries` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_entries_locale_group` ON `entries` (`locale_group`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_locale_group_locale_unique` ON `entries` (`locale_group`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_type_locale_slug_unique` ON `entries` (`type`,`locale`,`slug`);--> statement-breakpoint
UPDATE `entries` SET `status` = 'unpublished' WHERE `status` = 'draft';--> statement-breakpoint
UPDATE `entry_versions` SET `status` = 'unpublished' WHERE `status` = 'draft';