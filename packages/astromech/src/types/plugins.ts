/**
 * Plugin system types.
 *
 * A plugin is one npm package, framework-agnostic. Its definition is almost
 * entirely declarative data; `setup(ctx)` is an optional imperative escape
 * hatch.
 */

import type { ComponentType, ReactElement } from 'react';
import type { Kysely, MigrationProvider } from 'kysely';
import type { DB } from '@/database/types.js';
import type { TableDescriptor } from '@/database/define-table.js';
import type {
    AdminPage,
    AdminSlotContribution,
    DbDump,
    EntryTypeConfig,
    ResolvedConfig,
} from './config.js';
import type { FieldDefinition, FieldValidator } from './fields.js';
import type { User, NotifyInput } from './domain.js';
import type { PluginHooks } from './hooks.js';
import type { AstromechClient } from './sdk.js';
import type { EntriesApi } from './api.js';
import type { ServiceMethodEffect } from './services.js';

// ============================================================================
// Email overrides (carried over from the prior plugin surface)
// ============================================================================

export type EmailTemplateOverride = {
    name: string;
    component: ComponentType<Record<string, unknown>>;
};

// ============================================================================
// Plugin Context — unified across hooks / sdk / cron / api
// ============================================================================

/** Storage scoped to a plugin — keys are transparently namespaced under `plugin/<alias>/`. */
export type PluginStorage = {
    put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: { contentType?: string }
    ): Promise<void>;
    get(
        key: string
    ): Promise<{ body: ReadableStream; size: number; contentType?: string } | null>;
    list(prefix?: string): Promise<string[]>;
    delete(key: string): Promise<void>;
};

/** Database maintenance capabilities, feature-detected per driver. Distinct from `db` (the query instance). */
export type PluginDatabase = {
    dialect: string;
    dump?(): Promise<DbDump>;
    restore?(
        source: ReadableStream<Uint8Array>,
        opts: { preserve: string[] }
    ): Promise<void>;
};

/** Logger that attributes lines to the originating plugin. */
export type PluginLogger = {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string, error?: unknown) => void;
};

/**
 * The resolved config as seen by a plugin, plus footprint helpers. Plugin
 * "footprint" (which entry types use a plugin) is *derived* from field
 * presence, never declared.
 */
export type PluginConfigView = ResolvedConfig & {
    /** Entry type names whose field groups contain a field of the given name. */
    entryTypesWithField(fieldName: string): string[];
};

export type PluginContext = {
    db: Kysely<DB>;
    config: PluginConfigView;
    /** The acting user, or null for unauthenticated / system contexts. */
    user: User | null;
    sdk: AstromechClient;
    /**
     * Entries API auto-scoped to this plugin's own entry types. Address types by
     * their bare keys (`'redirect'`, not `'myplugin/redirect'`); the wrapper
     * qualifies them. No permission checks — server-side plugin altitude.
     */
    entries: EntriesApi;
    sendEmail: (to: string, subject: string, element: ReactElement) => Promise<void>;
    notify: (input: NotifyInput) => Promise<void>;
    logger: PluginLogger;
    /** Env vars (resolved via import.meta.env in Vite/Astro SSR). Never the browser. */
    env: Record<string, string | undefined>;
    /** Fire a (typically plugin-declared) hook event. */
    emit: (event: string, payload: unknown) => Promise<void>;
    /** Storage scoped to this plugin — keys are namespaced under `plugin/<alias>/` transparently. */
    storage: PluginStorage;
    /** Database maintenance capabilities (feature-detected per driver). Distinct from `db` (the query instance). */
    database: PluginDatabase;
};

// ============================================================================
// SDK methods + raw escape hatch
// ============================================================================

/**
 * Access policy for a plugin SDK method or raw route. There is no default —
 * omitting `access` is a build error (the field is required).
 */
export type PluginAccess = 'public' | 'authenticated' | { permission: string };

export type PluginSdkMethod<Input = unknown, Output = unknown> = {
    access: PluginAccess;
    handler: (input: Input, ctx: PluginContext) => Promise<Output> | Output;
    /** One-line summary for the method manifest (discovery / MCP / AI tool-loop). */
    summary?: string;
} & Partial<ServiceMethodEffect>;

/** Collection element for a plugin's sdk record: variance-safe over any concrete method. */
export type AnyPluginSdkMethod = PluginSdkMethod<never, unknown>;

/**
 * Raw request handler for payloads RPC-JSON can't carry (binary / multipart /
 * streaming). Mounted inside `/api/plugins/{name}/*`.
 */
export type PluginRawRoute = {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** Path relative to `/api/plugins/{name}`, e.g. `/upload`. */
    path: string;
    access: PluginAccess;
    handler: (request: Request, ctx: PluginContext) => Promise<Response> | Response;
};

// ============================================================================
// Permissions
// ============================================================================

export type PluginPermission = {
    /** Action segment, e.g. `lookup` → `plugin:<namespace>:lookup`. */
    key: string;
    label: string;
    description?: string;
};

// ============================================================================
// CRON
// ============================================================================

export type PluginCronJob = {
    name: string;
    schedule: string;
    handler: (ctx: PluginContext) => Promise<void> | void;
};

// ============================================================================
// Admin surfaces
// ============================================================================

/**
 * Derived sidebar tree node. Plugin authors don't write these — core derives
 * the tree from `admin.pages` (nav-visible pages group under the plugin's
 * `admin.nav` identity).
 */
export type PluginNavItem = {
    label: string;
    /** Where the item points — any admin path. */
    to?: string;
    icon?: string;
    /** Auto-hides the item when the user lacks this permission. */
    permission?: string;
    children?: PluginNavItem[];
};

/**
 * Plugin admin pages use the unified `AdminPage` type. The plugin author
 * declares exactly one of `fields` (settings form) or `component` (custom
 * React page), with an optional `permission` override (bare keys are
 * auto-namespaced to `plugin:<ns>:<key>`).
 */
export type PluginAdmin = {
    pages?: AdminPage[];
    slots?: AdminSlotContribution[];
};

/**
 * Custom field type registration. The renderer module (resolved from the
 * `component` import specifier by the code-gen virtual module) must default-
 * export a component taking the standard field props (`BaseFieldProps`), and
 * may export `validate(value, field)` returning an error message or
 * `undefined`. That `validate` runs only in the browser; for server-side
 * enforcement supply `serverValidate` below.
 */
export type PluginFieldTypeRegistration = {
    /** Field type key, e.g. `seo-preview`. Colliding with a core type or another plugin is a build error. */
    type: string;
    /** Import specifier (STRING) for the renderer module. */
    component: string;
    /** Serializable value shown when the field has no stored value yet. */
    defaultValue?: unknown;
    /**
     * TS type for generated entry `Fields` interfaces. Defaults to `JsonValue`.
     * Return `null` for a presentational field that persists no data (e.g. a
     * preview) so it is omitted from the generated type entirely.
     */
    typeGen?: (field: FieldDefinition) => string | null;
    /**
     * Server-side validator — the type-intrinsic rule for this custom field,
     * enforced by the field pipeline on every mutation (not just the browser).
     * Async; returns `true` when valid or an error message string. Wired into
     * the pipeline in P2/P3.
     */
    serverValidate?: FieldValidator;
};

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * What a plugin declares about itself, and nothing more. `package` is the one
 * canonical identifier — the namespace behind every table prefix, permission
 * string, i18n bundle and SDK key is derived from it mechanically, and cannot
 * be declared or overridden.
 *
 * A plugin package exports one of these (`plugin.ts`) and passes it to both
 * `definePlugin` and `definePluginTable`:
 *
 * ```ts
 * export const plugin = {
 *     package: '@astromech/redirects',
 *     version: '0.1.0',
 *     label: 'Redirects',
 *     icon: 'Signpost',
 * } as const satisfies PluginIdentity;
 * ```
 *
 * `as const` is what gives `package` a literal type, which is what lets
 * `definePluginTable` derive a literal table name for `PluginDB`.
 */
export type PluginIdentity = {
    /** Canonical package name, e.g. `@astromech/redirects`. */
    package: string;
    /** Own version (e.g. from package.json) — enables `dependsOn` semver checks. */
    version?: string;
    /**
     * Display name in the admin — sidebar group and page-title prefix.
     * Defaults to a title-cased namespace.
     */
    label?: string;
    /** Lucide icon name for the sidebar group. Defaults to a puzzle piece. */
    icon?: string;
};

export type PluginDefinition = PluginIdentity & {
    // ── Declarative surfaces ────────────────────────────────────────────
    permissions?: PluginPermission[];
    /** Entry types contributed by the plugin. Each self-declares its `type`. */
    entries?: EntryTypeConfig[];
    fields?: PluginFieldTypeRegistration[];
    /**
     * `defineTable` descriptors shipped by the plugin (create via
     * `definePluginTable`; names are `plugin_<namespace>_` prefixed).
     */
    schema?: TableDescriptor[];
    /**
     * The plugin's own migration provider — the `migrations/index.ts` generated
     * by `astromech plugin:generate`. Merged into the app's migration chain at
     * apply time under `plugin_<namespace>_`-prefixed names, so the plugin's own
     * files keep their bare `NNNN_<tag>` names.
     */
    migrations?: MigrationProvider;
    sdk?: Record<string, AnyPluginSdkMethod>;
    rawRoutes?: PluginRawRoute[];
    hooks?: PluginHooks;
    /** Custom events this plugin fires via `ctx.emit`. Type-augmented in 18b. */
    hookEvents?: string[];
    cron?: PluginCronJob[];
    admin?: PluginAdmin;
    /**
     * Admin-UI locale resources, keyed by locale code. Values are import
     * specifiers (STRINGS, e.g. `'./locales/en.json'` resolved by the
     * plugin) so the code-gen virtual module can emit lazy `import()` calls
     * (spec §11). Namespace = the derived plugin namespace.
     */
    i18n?: Record<string, string>;
    requiredEnv?: string[];
    /** Package name → semver range. Existence + basic range check only. */
    dependsOn?: Record<string, string>;
    emails?: EmailTemplateOverride[];

    // ── Imperative escape hatch ─────────────────────────────────────────
    /** Runs once per runtime boot. Optional. */
    setup?: (ctx: PluginContext) => void | Promise<void>;
};

/** The result of a plugin factory — what users place in `config.plugins`. */
export type PluginFactory<Options = void> = (options?: Options) => PluginDefinition;

/**
 * Fully-derived plugin identity, computed once during config resolution.
 *
 * `namespace` is the string form and the only namespace there is — table
 * prefix, i18n bundle, HTTP route segment and permission strings all use it.
 * `permissionNamespace` is the same string, kept as its own field because
 * permission call sites read better naming what they anchor to.
 * `sdkKey` is the camelCase form, used only where a JS property key is
 * required (`sdk.acmeSeo`, `Astromech.plugins.acmeSeo`).
 */
export type ResolvedPluginIdentity = {
    package: string;
    namespace: string;
    sdkKey: string;
    permissionNamespace: string;
    version?: string;
};
