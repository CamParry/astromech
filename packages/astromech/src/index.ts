/**
 * Astromech — framework-agnostic core.
 * For Astro projects, import the integration from 'astromech/astro'.
 */

import type {
    AdminPage,
    AstromechConfig,
    EntryType,
    Hook,
    HookEvent,
    HookHandlerFor,
    Permission,
    PluginDefinition,
    PluginFactory,
    ServiceMethod,
} from '@/types/index.js';
import { pluginNamespace } from '@/utilities/plugin-namespace.js';
import * as zod from 'zod';

// ============================================================================
// Type Exports
// ============================================================================

export * from '@/types/index.js';
export { ConsoleDriver } from '@/email/drivers/console.js';
export { ResendDriver } from '@/email/drivers/resend.js';
export type { ResendDriverOptions } from '@/email/drivers/resend.js';
export { SmtpDriver } from '@/email/drivers/smtp.js';
export type { SmtpDriverOptions } from '@/email/drivers/smtp.js';
export { runScheduledJobs } from '@/cron/index.js';
// Model access, so a plugin can reach a configured model without taking its own
// SDK dependency. Absent unless the site configures `ai` — hence `undefined`.
export { getModel, hasModel } from '@/ai/index.js';
export { builtInRole, BUILT_IN_ROLES } from '@/permissions/index.js';
export type { BuiltInRoleSlug } from '@/permissions/index.js';
export { definePermissions } from '@/permissions/define.js';
export type {
    PermissionDeclaration,
    PermissionDeclarations,
} from '@/permissions/define.js';
// Entry permissions are derived, never declared — a site grants a plugin's entry
// types with these rather than reading a list off the plugin.
export {
    type EntryAction,
    entryPermission,
    entryPermissions,
} from '@/permissions/entry-permission.js';
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
// Plugin schema authoring (formerly `astromech/plugin-kit`, dissolved in 2c —
// see roadmap/completed/plugin-authoring-experience.md)
// ============================================================================

export { definePluginTable } from '@/database/define-plugin-table.js';
export type { KyselyTableKey, PluginDB } from '@/database/define-plugin-table.js';
// The whole `Table` type vocabulary, not just the headline types: a plugin's
// emitted `.d.ts` has to be able to *name* the type `definePluginTable` infers,
// and that mentions `Column`/`IndexSpec` structurally. Without them on this
// public surface, a plugin build fails with TS2742 ("inferred type cannot be
// named without a reference to <hashed dts chunk>").
export type {
    AnyCols,
    ColFactory,
    Column,
    ColumnKind,
    ColumnRuntime,
    IndexFactory,
    IndexSpec,
    KyselyOf,
    OnDelete,
    ReferenceSpec,
    ReferenceTarget,
    Table,
    TableInsert,
    TableOptions,
    TableSelect,
    TableUpdate,
} from '@/database/define-table.js';
export { decodeWith, encodeWith, encodePatchWith } from '@/database/codec.js';
// The `Table`-backed CRUD wrapper, on the same surface as the `Table`
// vocabulary and the codec it is built on: a plugin holding a `definePluginTable`
// table composes `createStorage` inside its own `createXStorage(db)` factory
// exactly as core's domains do, and then never spells the table name or reaches
// for a codec again. Its public types ship with it for the TS2742 reason above —
// a plugin's `.d.ts` has to be able to *name* what the factory returns.
export { createStorage } from '@/database/storage/create-storage.js';
export type {
    FindManyParams,
    GenericDb,
    OrderBy,
    Patch,
    QueryHandle,
    Storage,
    UpsertOptions,
    Where,
} from '@/database/storage/create-storage.js';
export { tableStorage } from '@/entries/storage/table.js';
export { t } from '@/utilities/labels.js';
// Rich text is stored as ProseMirror JSON and rendered to sanitized HTML on
// public reads. A plugin holding richtext that is `private` — and so absent
// from the public shape — has no read to get HTML from, and must render it
// itself. Exported so that never means reimplementing the sanitizer.
// `parseRichText` is the inverse, for anything holding HTML that has to become
// a stored document.
export { parseRichText, renderRichText } from '@/fields/rich-text/index.js';
// The relationships index is derived from field data, so anything writing
// entries outside the normal operations (a seed, a rebuild) needs the same pure
// traversal core uses rather than a second, drifting copy of it.
export {
    collectRelationshipEdges,
    collectRelationshipSchemaPaths,
} from '@/fields/relationship-edges.js';
export type { RelationshipEdge, TargetKind } from '@/fields/relationship-edges.js';
// The AI context formatter ships from the plugin-authoring surface as well as
// `astromech/methods`: a plugin building a chat request needs it, and this is
// the only barrel it may import.
export { formatAIContextMessage } from '@/utilities/ai-context.js';

// ============================================================================
// Config / Collection / Plugin Helpers
// ============================================================================

export function defineConfig(config: AstromechConfig): AstromechConfig {
    return config;
}

/**
 * Define one entry type — the *shape* of a kind of content (its fields,
 * capabilities, admin columns and URL template), not a piece of content.
 *
 * Reach for it when an entry type outgrows its inline declaration in
 * `defineConfig` and wants its own module. Entry types are the part of a config
 * that grows without bound, and `defineConfig` only type-checks what is written
 * inside the call — so a bare object exported from another file gets no
 * checking until it is spread back in, and reports errors at the spread site
 * rather than at the mistake. Wrapping it here restores both.
 *
 * Declaring the type inline in `defineConfig` stays correct and is the right
 * default for small ones; this is the escape hatch for when a site has enough
 * of them that one file per type reads better.
 *
 * ```ts
 * // src/entries/author.ts
 * export const author = defineEntryType({
 *     single: 'Author',
 *     plural: 'Authors',
 *     fields: [fields.richtext('bio', { label: 'Bio' })],
 * });
 *
 * // astromech.config.ts
 * export default defineConfig({ entries: { author } });
 * ```
 *
 * Root-config entry types are keyed by the `entries` record and leave `type`
 * unset; a plugin's entry types self-declare `type` so they can be listed in
 * the plugin's `entries` array.
 */
export function defineEntryType(config: EntryType): EntryType {
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
 * The factory carries a `permissions(...keys)` accessor that selects individual
 * keys from the definition's `permissions` declaration and returns them already
 * namespaced, so a site composes roles straight off the plugin and enumerates
 * exactly what it grants: `[...seo.permissions('view', 'write')]`.
 *
 * A factory MUST be a pure data builder: Astromech calls it once with no
 * options to read identity and permission declarations, and again for each site
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
    // instantiating the plugin — identity and permission declarations. Cached so
    // a factory is not re-run per `permissions()` call.
    let base: Def | undefined;
    const baseDefinition = (): Def => (base ??= build());

    const factory = ((options?: Options) => build(options)) as PluginFactory<
        Options,
        Def
    >;

    factory.permissions = (...keys: string[]) => {
        const definition = baseDefinition();
        const declared = definition.permissions ?? {};
        if (keys.length === 0) {
            throw new Error(
                `\`${definition.package}\`.permissions() needs at least one permission key. ` +
                    `Name the permissions to grant, e.g. permissions('read', 'update').`
            );
        }
        const available = Object.keys(declared);
        for (const key of keys) {
            if (!(key in declared)) {
                throw new Error(
                    `Unknown permission "${key}" for plugin "${definition.package}". ` +
                        (available.length > 0
                            ? `Available: ${available.join(', ')}.`
                            : `The plugin declares no \`permissions\`.`)
                );
            }
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
 * Zod, re-exported so a plugin can declare a service method's `input` schema
 * without adding a `zod` dependency of its own — and, more to the point, without
 * risking a SECOND copy. `z.toJSONSchema` and every `instanceof` check inside
 * the manifest generator work on the core's instance; a plugin schema built by a
 * different copy would silently fail to serialise.
 *
 * A method with no `input` cannot be projected as an MCP tool at all, so this is
 * what makes plugin methods reachable from the AI/MCP surface.
 */
export { z } from 'zod';

/**
 * The `input` schema for a service method that takes no arguments.
 *
 * A no-argument method still has to declare an input, because a tool with no
 * `inputSchema` cannot be published at all — MCP requires an object schema, and
 * a method that declares nothing is skipped rather than given a synthesised one.
 *
 * `z.object({})` alone would not typecheck against `defineServiceMethod<undefined,
 * …>`; the transform is what reconciles the two, and it renders as
 * `{type: 'object', properties: {}}` — "send me an empty object" — which is
 * precisely the truth.
 */
export function noInput(): zod.ZodType<undefined> {
    return zod.object({}).transform(() => undefined);
}

/**
 * Define a typed service method (a plugin's contribution to the unified services
 * layer). The Input/Output generics flow into the plugin's self-augmentation of
 * `AstromechPluginServices` so callers see real signatures. The returned
 * `ServiceMethod` carries its manifest metadata (`summary`, `input`, …) too.
 */
export function defineServiceMethod<Input = unknown, Output = unknown>(
    method: ServiceMethod<Input, Output>
): ServiceMethod<Input, Output> {
    return method;
}

/**
 * Define a single plugin hook; payload type is inferred from the event key.
 * Collected into the plugin's `hooks` array.
 */
export function defineHook<E extends HookEvent>(
    event: E,
    handler: HookHandlerFor<E>
): Hook {
    return { event, handler: handler as Hook['handler'] };
}
