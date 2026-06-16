/**
 * Astromech — framework-agnostic core.
 * For Astro projects, import the integration from 'astromech/astro'.
 */

import type {
    AdminPage,
    AstromechConfig,
    DefinedHook,
    EntryTypeConfig,
    HookEvent,
    HookHandlerFor,
    PluginDefinition,
    PluginFactory,
    PluginSdkMethod,
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
export {
    builtInRole,
    definePermissionBundles,
    BUILT_IN_ROLES,
} from '@/core/permissions.js';
export type { BuiltInRoleSlug } from '@/core/permissions.js';
export { withDefaults } from '@/core/options.js';
export { resolveEntryUrl, resolveEntryPath } from '@/core/entry-url.js';
export type { UrlEntry } from '@/core/entry-url.js';
export { defaultImageWidths } from '@/images/defaults.js';

// Field factories now live in the `astromech/fields` subpath (see src/fields.ts).

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

/**
 * Define an admin page for use in `admin.pages` (both host app and plugins).
 * A page is a `component` view or a `fields` settings form, and appears in
 * the sidebar unless it opts out (`nav: false`). Exactly one of `fields` or
 * `component` must be provided; this is validated crash-loud at config
 * resolution.
 */
export function defineAdminPage(page: AdminPage): AdminPage {
    return page;
}

/**
 * Define a typed plugin SDK method. The Input/Output generics flow into the
 * plugin's self-augmentation of `AstromechPluginSdks` so callers see real
 * signatures.
 */
export function defineSdkMethod<Input = unknown, Output = unknown>(
    method: PluginSdkMethod<Input, Output>
): PluginSdkMethod<Input, Output> {
    return method;
}

/**
 * Define a single plugin hook; payload type is inferred from the event key.
 * Collected into the plugin's `hooks` array.
 */
export function defineHook<E extends HookEvent>(
    event: E,
    handler: HookHandlerFor<E>
): DefinedHook {
    return { event, handler: handler as DefinedHook['handler'] };
}
