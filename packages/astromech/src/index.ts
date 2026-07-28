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
    Permission,
    PluginDefinition,
    PluginFactory,
    PluginServiceMethod,
} from '@/types/index.js';
import { pluginNamespace } from '@/utilities/plugin-namespace.js';

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
export { libsqlDriver } from '@/database/drivers/libsql.js';
export { d1Driver } from '@/database/drivers/d1.js';
export { runScheduledJobs } from '@/cron/index.js';
export { builtInRole, BUILT_IN_ROLES } from '@/permissions/index.js';
export type { BuiltInRoleSlug } from '@/permissions/index.js';
export { withDefaults } from '@/utilities/options.js';
export { resolveEntryUrl, resolveEntryPath } from '@/entries/utils/url.js';
export type { UrlEntry } from '@/entries/utils/url.js';
export { defaultImageWidths } from '@/media/serving/image/defaults.js';
export { buildImageAttrs } from '@/media/serving/image/build-image-attrs.js';
export type {
    ImageAttrs,
    ImageAttrsContext,
    ImageAttrsInput,
    ImageAttrsOptions,
} from '@/media/serving/image/build-image-attrs.js';

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
 * Define a plugin from one object — identity and behaviour together, the way
 * `defineConfig` takes one config. `package` is a key like any other, so a
 * plugin never has to hand its own identity to itself, and nothing inside the
 * package needs to import an identity module to build a namespaced string.
 *
 * Pass a plain definition, or a factory when the plugin takes options. Either
 * way the result is a **factory**, so sites always call it: `plugins: [seo(),
 * redirects({ … })]`.
 *
 * Relative asset specifiers (`'./admin/pages/overview.tsx'`) on `fields`,
 * `admin.pages`, `admin.slots` and `i18n` resolve against `root` — see
 * {@link PluginDefinition.root}.
 *
 * The factory carries a `permissions(bundle)` accessor for any
 * `permissionBundles` the definition declares, already namespaced, so a site
 * composes roles straight off the plugin: `[...seo.permissions('view')]`.
 *
 * A factory MUST be a pure data builder: Astromech calls it once with no
 * options to read identity and permission bundles, and again for each site
 * instantiation.
 *
 * @example
 * export const seo = definePlugin({
 *     package: '@astromech/seo',
 *     label: 'SEO',
 *     fields: [seoPreviewField],
 * });
 *
 * @example
 * export const redirects = definePlugin((options?: RedirectsOptions) => ({
 *     package: '@astromech/redirects',
 *     entries: [redirectEntryType],
 *     ...(options?.generateOnSlugChange !== false && { hooks: [slugChangeHook] }),
 * }));
 */
export function definePlugin<const Def extends PluginDefinition, Options = void>(
    source: Def | ((options?: Options) => Def)
): PluginFactory<Options, Def> {
    const build = (options?: Options): Def =>
        typeof source === 'function' ? source(options) : source;

    // One no-options build backs the surfaces a site reads *without*
    // instantiating the plugin — identity and permission bundles. Cached so a
    // factory is not re-run per `permissions()` call.
    let base: Def | undefined;
    const baseDefinition = (): Def => (base ??= build());

    const factory = ((options?: Options) => build(options)) as PluginFactory<
        Options,
        Def
    >;

    factory.permissions = (bundle: string) => {
        const definition = baseDefinition();
        const bundles = definition.permissionBundles ?? {};
        const keys = bundles[bundle];
        if (!keys) {
            const available = Object.keys(bundles);
            throw new Error(
                `Unknown permission bundle "${bundle}" for plugin "${definition.package}". ` +
                    (available.length > 0
                        ? `Available: ${available.join(', ')}.`
                        : `The plugin declares no \`permissionBundles\`.`)
            );
        }
        const namespace = pluginNamespace(definition.package);
        return keys.map((key) => `plugin:${namespace}:${key}` as Permission);
    };

    return factory;
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
 * Define a typed service method (a plugin's contribution to the unified services
 * layer). The Input/Output generics flow into the plugin's self-augmentation of
 * `AstromechPluginServices` so callers see real signatures. The method may carry
 * descriptor metadata (`summary`, `input`, `mutates`, `destructive`, …) for the
 * method manifest.
 */
export function defineServiceMethod<Input = unknown, Output = unknown>(
    method: PluginServiceMethod<Input, Output>
): PluginServiceMethod<Input, Output> {
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
