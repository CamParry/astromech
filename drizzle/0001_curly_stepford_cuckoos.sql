CREATE TABLE `entity_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`title` text NOT NULL,
	`fields` text,
	`status` text,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_versions_entity` ON `entity_versions` (`entity_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `roles` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`is_built_in` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `entities` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `entities` ADD `updated_by` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `idx_entities_collection` ON `entities` (`collection`);--> statement-breakpoint
CREATE INDEX `idx_entities_slug` ON `entities` (`collection`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_entities_status` ON `entities` (`collection`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entities_locale` ON `entities` (`collection`,`locale`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entities_deleted` ON `entities` (`deleted_at`);