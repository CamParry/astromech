/**
 * Plugin system types.
 *
 * A plugin is one npm package, framework-agnostic. Its definition is almost
 * entirely declarative data; `setup(ctx)` is an optional imperative escape
 * hatch. See `specs/plugin-architecture.md` for the full design.
 */

import type { ComponentType, ReactElement } from 'react';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { EntryTypeConfig, ResolvedConfig } from './config.js';
import type { FieldDefinition } from './fields.js';
import type { User } from './domain.js';
import type { PluginHooks } from './hooks.js';
import type { AstromechClient } from './sdk.js';
import type { EntriesApi } from './api.js';

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
    logger: PluginLogger;
    /** Env vars (resolved via import.meta.env in Vite/Astro SSR). Never the browser. */
    env: Record<string, string | undefined>;
    /** Fire a (typically plugin-declared) hook event. */
    emit: (event: string, payload: unknown) => Promise<void>;
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
};

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
// Admin surfaces (consumed in 18b; declared here for a stable shape)
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

export type PluginPage = {
    /** Path relative to `/admin/plugin/{name}`. */
    path: string;
    /**
     * Short page name — the sidebar label. Page titles compose it with the
     * plugin label: `'Overview'` under a plugin labelled `'SEO'` renders as
     * "SEO Overview".
     */
    label: string;
    /** Lucide icon name — shown in the sidebar (page chrome later). */
    icon?: string;
    /**
     * Import specifier (a STRING, not a thunk) for the page component, so the
     * Node-side generator can statically emit `import(specifier)`.
     * Omit for an auto-rendered settings page (declare `settings` instead).
     */
    component?: string;
    /**
     * Settings schema for an auto-rendered settings form (used when no
     * `component` is given). Values store under
     * `plugin:<permissionNamespace>:<field>` in the core settings table.
     */
    settings?: PluginSettingsSchema;
    /**
     * Bare keys are plugin-scoped (`'view'` → `plugin:<ns>:view`); strings
     * containing `:` pass through unchanged (core permissions like
     * `settings:read`). Settings pages default to `settings:read`.
     */
    permission?: string;
    /** Pages appear in the sidebar by default; `false` opts out. */
    nav?: boolean;
};

export type PluginSettingsSchema = {
    fields: FieldDefinition[];
};

export type PluginAdmin = {
    pages?: PluginPage[];
};

/**
 * Custom field type registration. The renderer module (resolved from the
 * `component` import specifier by the code-gen virtual module) must default-
 * export a component taking the standard field props (`BaseFieldProps`), and
 * may export `validate(value, field)` returning an error message or
 * `undefined`.
 */
export type PluginFieldTypeRegistration = {
    /** Field type key, e.g. `seo-meta`. Colliding with a core type or another plugin is a build error. */
    type: string;
    /** Import specifier (STRING) for the renderer module. */
    component: string;
    /** Serializable value shown when the field has no stored value yet. */
    defaultValue?: unknown;
    /** TS type for generated entry `Fields` interfaces. Defaults to `JsonValue`. */
    typeGen?: (field: FieldDefinition) => string;
};

// ============================================================================
// Plugin Definition
// ============================================================================

/** A Drizzle schema module: a map of exported table objects. */
export type PluginDrizzleSchema = Record<string, unknown>;

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
    entries?: Record<string, EntryTypeConfig>;
    fields?: PluginFieldTypeRegistration[];
    schema?: PluginDrizzleSchema;
    sdk?: Record<string, PluginSdkMethod>;
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
