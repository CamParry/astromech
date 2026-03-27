/**
 * Astromech — framework-agnostic core.
 * For Astro projects, import the integration from 'astromech/astro'.
 */

import type { AstromechConfig, AstromechPlugin, CollectionConfig } from '@/types/index.js';

// ============================================================================
// Type Exports
// ============================================================================

export * from '@/types/index.js';
export { FilesystemStorage } from '@/storage/filesystem.js';
export { ConsoleDriver } from '@/email/drivers/console.js';
export { ResendDriver } from '@/email/drivers/resend.js';
export type { ResendDriverOptions } from '@/email/drivers/resend.js';
export { SmtpDriver } from '@/email/drivers/smtp.js';
export type { SmtpDriverOptions } from '@/email/drivers/smtp.js';
export { libsqlDriver } from '@/db/drivers/libsql.js';
export { d1Driver } from '@/db/drivers/d1.js';
export { runScheduledJobs } from '@/cron/index.js';

// ============================================================================
// Config / Collection / Plugin Helpers
// ============================================================================

export function defineConfig(config: AstromechConfig): AstromechConfig {
	return config;
}

export function defineCollection(config: CollectionConfig): CollectionConfig {
	return config;
}

export function definePlugin(plugin: AstromechPlugin): AstromechPlugin {
	return plugin;
}
