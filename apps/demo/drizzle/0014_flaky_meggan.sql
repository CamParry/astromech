CREATE TABLE `entry_preview_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_preview_tokens_token_unique` ON `entry_preview_tokens` (`token`);--> statement-breakpoint
DROP INDEX `entries_type_locale_slug_unique`;--> statement-breakpoint
ALTER TABLE `entries` ADD `staged_for` text REFERENCES entries(id);--> statement-breakpoint
CREATE INDEX `idx_entries_staged_for` ON `entries` (`staged_for`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_type_locale_slug_unique` ON `entries` (`type`,`locale`,`slug`) WHERE "entries"."staged_for" is null;