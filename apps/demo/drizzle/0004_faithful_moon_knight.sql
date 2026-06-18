PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`locale` text,
	`slug` text,
	`title` text NOT NULL,
	`fields` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`translation_of` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`translation_of`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_entries`("id", "type", "locale", "slug", "title", "fields", "status", "published_at", "deleted_at", "created_at", "updated_at", "created_by", "updated_by", "translation_of") SELECT "id", "type", "locale", "slug", "title", "fields", "status", "published_at", "deleted_at", "created_at", "updated_at", "created_by", "updated_by", "translation_of" FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `__new_entries` RENAME TO `entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_entries_type` ON `entries` (`type`);--> statement-breakpoint
CREATE INDEX `idx_entries_slug` ON `entries` (`type`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_entries_status` ON `entries` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entries_locale` ON `entries` (`type`,`locale`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entries_deleted` ON `entries` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_entries_translation_of` ON `entries` (`translation_of`);