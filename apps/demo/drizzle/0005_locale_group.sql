-- Replace asymmetric translation_of FK with symmetric locale_group identifier.
-- See specs/symmetric-locale-model.md for design.
--
-- Approach: SQLite can't drop a column referenced by an FK without table
-- recreation. Since this migration runs against dev DBs only and any seeded
-- data is rebuilt via `npm run db:seed`, we rebuild the entries table from
-- scratch. Any existing rows are dropped — re-seed after migrating.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

DROP INDEX IF EXISTS idx_entries_type;--> statement-breakpoint
DROP INDEX IF EXISTS idx_entries_slug;--> statement-breakpoint
DROP INDEX IF EXISTS idx_entries_status;--> statement-breakpoint
DROP INDEX IF EXISTS idx_entries_locale;--> statement-breakpoint
DROP INDEX IF EXISTS idx_entries_deleted;--> statement-breakpoint
DROP INDEX IF EXISTS idx_entries_translation_of;--> statement-breakpoint

DROP TABLE entries;--> statement-breakpoint

CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`locale` text NOT NULL,
	`locale_group` text NOT NULL,
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
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint

CREATE INDEX `idx_entries_type` ON `entries` (`type`);--> statement-breakpoint
CREATE INDEX `idx_entries_status` ON `entries` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entries_locale` ON `entries` (`type`,`locale`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entries_deleted` ON `entries` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_entries_locale_group` ON `entries` (`locale_group`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_locale_group_locale_unique` ON `entries` (`locale_group`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_type_locale_slug_unique` ON `entries` (`type`,`locale`,`slug`);--> statement-breakpoint

PRAGMA foreign_keys=ON;
