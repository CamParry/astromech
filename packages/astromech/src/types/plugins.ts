/**
 * Plugin system types.
 *
 * A plugin is one npm package, framework-agnostic. Its definition is almost
 * entirely declarative data; `setup(ctx)` is an optional imperative escape
 * hatch.
 */

import type { ComponentType, ReactElement } from 'react';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { AdminPage, DbDump, EntryTypeConfig, ResolvedConfig } from './config.js';
import type { FieldDefinition } from './fields.js';
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
    db: LibSQLDatabase;
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
};

/**
 * Custom field type registration. The renderer module (resolved from the
 * `component` import specifier by the code-gen virtual module) must default-
 * export a component taking the standard field props (`BaseFieldProps`), and
 * may export `validate(value, field)` returning an error message or
 * `undefined`.
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
};

// ============================================================================
// Plugin Definition
// ============================================================================

export type PluginDefinition = {
    // ── Identity ────────────────────────────────────────────────────────
    /** Canonical package name, e.g. `@astromech/redirects`. */
    package: string;
    /** Own version (e.g. from package.json) — enables `dependsOn` semver checks. */
    version?: string;
    /** Access key on `Astromech.plugins.X`. Defaults to the last path segment. */
    name?: string;
    /** User override for access-key collisions. */
    alias?: string;
    /**
     * Display name in the admin — sidebar group and page-title prefix.
     * Defaults to the access key.
     */
    label?: string;
    /** Lucide icon name for the sidebar group. Defaults to a puzzle piece. */
    icon?: string;

    // ── Declarative surfaces ────────────────────────────────────────────
    permissions?: PluginPermission[];
    /** Entry types contributed by the plugin. Each self-declares its `type`. */
    entries?: EntryTypeConfig[];
    fields?: PluginFieldTypeRegistration[];
    /** Drizzle tables shipped by the plugin (each prefixed `plugin_{alias}_`). */
    schema?: unknown[];
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
     * (spec §11). Namespace = the sanitised package.
     */
    i18n?: Record<string, string>;
    requiredEnv?: string[];
    /** Package name → semver range. Existence + basic range check only. */
    dependsOn?: Record<string, string>;
    emails?: EmailTemplateOverride[];

    /**
     * Import specifier of a module whose top-level exports are the plugin's
     * Drizzle tables. Consumed by `astromech db:generate` to feed drizzle-kit
     * (which only reads top-level exports from the schema file).
     *
     * Example: `'my-plugin/schema'` or `'astromech/plugins/redirects/schema'`
     *
     * Plugins that ship `schema` tables without a `schemaModule` will be warned
     * at `db:generate` time — their tables cannot be included in the migration.
     */
    schemaModule?: string;

    // ── Imperative escape hatch ─────────────────────────────────────────
    /** Runs once per runtime boot. Optional. */
    setup?: (ctx: PluginContext) => void | Promise<void>;
};

/** The result of a plugin factory — what users place in `config.plugins`. */
export type PluginFactory<Options = void> = (options?: Options) => PluginDefinition;

/**
 * Fully-derived plugin identity, computed once during config resolution.
 */
export type ResolvedPluginIdentity = {
    package: string;
    name: string;
    alias: string;
    permissionNamespace: string;
    version?: string;
};
