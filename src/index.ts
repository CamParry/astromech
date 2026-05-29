/**
 * Astromech — framework-agnostic core.
 * For Astro projects, import the integration from 'astromech/astro'.
 */

import type {
	AstromechConfig,
	EntryTypeConfig,
	PluginDefinition,
	PluginFactory,
} from '@/types/index.js';

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

export function defineEntryType(config: EntryTypeConfig): EntryTypeConfig {
	return config;
}

/**
 * Define a plugin as a factory. First-party plugins export the returned
 * function and are callable with zero args (`redirects()`); options are always
 * optional, and the factory is responsible for validating them and applying
 * defaults internally.
 *
 * @example
 * export const redirects = definePlugin<RedirectsOptions>((options) => ({
 *     package: '@astromech/redirects',
 *     // ...declarative definition...
 * }));
 */
export function definePlugin<Options = void>(
	factory: (options?: Options) => PluginDefinition
): PluginFactory<Options> {
	return (options?: Options) => factory(options);
}
