/**
 * Plugin system types.
 *
 * A plugin is one npm package, framework-agnostic. Its definition is almost
 * entirely declarative data; `setup(ctx)` is an optional imperative escape
 * hatch.
 */

import type {
    AdminPage,
    AdminSlotContribution,
    DbDump,
    EntryType,
    GlobalConfig,
    ResolvedConfig,
    StorageObject,
} from './config';
import type { NotifyInput, Permission, Role, User } from './domain';
import type { Field, FieldValidator } from './fields';
import type { HookEvent, HookPayloadFor, PluginHooks } from './hooks';
import type { ServiceMethodEffect, ToolDefinition } from './methods';
import type {
    MediaService,
    NotificationsService,
    SettingsService,
    UsersService,
} from './services';
import type { TypedEntriesService } from './typed-entries';
import type { TypedGlobalsService } from './typed-globals';
import type { Table } from '@/database/define-table';
import type { DB } from '@/database/types';
import type { PermissionDeclarations } from '@/permissions/define';
import type { z } from '@hono/zod-openapi';
import type { Kysely, MigrationProvider } from 'kysely';
import type { ComponentType, ReactElement } from 'react';

export type EmailTemplateOverride = {
    name: string;
    component: ComponentType<Record<string, unknown>>;
};

/** Storage scoped to a plugin — keys are transparently namespaced under `plugin/<alias>/`. */
export type PluginStorage = {
    put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: { contentType?: string }
    ): Promise<void>;
    get(key: string): Promise<StorageObject | null>;
    list(prefix?: string): Promise<string[]>;
    delete(key: string): Promise<void>;
};

/**
 * Email scoped to a plugin — the element is rendered to html and text here, and
 * a missing email driver throws rather than sending nothing. The envelope sender
 * comes from the configured driver, never from the caller.
 */
export type PluginEmail = {
    send(to: string, subject: string, element: ReactElement): Promise<void>;
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

/** The method manifest as a plugin reaches it: a dispatch table, already scoped. */
export type PluginMethods = {
    /**
     * Every manifest method the acting role may call, dispatch-ready and already
     * scoped. Plugin-source methods are absent: their declared `access` is
     * enforced by the HTTP RPC route, so there is nothing to scope them with.
     */
    tools(options?: { readOnly?: boolean }): ToolDefinition[];
};

/** Logger that attributes lines to the originating plugin. */
export type PluginLogger = {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string, error?: unknown) => void;
};

/**
 * A projection of the resolved config, not the whole of it. `ResolvedConfig`
 * holds no capability drivers, so this `Pick` is a second layer: a field added
 * to `ResolvedConfig` stays invisible to plugins until it is named both here and
 * in `makeConfigView`. Plugin "footprint" (which entry types use a plugin) is
 * *derived* from field presence, never declared.
 */
export type PluginConfigView = Pick<
    ResolvedConfig,
    | 'entries'
    | 'pluginEntries'
    | 'globals'
    | 'pluginGlobals'
    | 'adminPages'
    | 'admin'
    | 'media'
    | 'users'
    | 'locales'
    | 'defaultLocale'
    | 'basePath'
    | 'mediaRoute'
    | 'trash'
    | 'publicSettingKeys'
    | 'timezone'
    | 'roles'
> & {
    /** Entry type names whose field groups contain a field of the given name. */
    entryTypesWithField(fieldName: string): string[];
};

/** Everything a plugin's hooks, service methods, cron jobs and routes run with. */
export type PluginContext = {
    db: Kysely<DB>;
    /**
     * This plugin's own resolved identity. Runtime code that needs a namespaced
     * string — a settings key, a permission, an i18n bundle name — reads it
     * from here rather than importing an identity module, which is what keeps a
     * plugin's sub-modules free of any dependency on its identity.
     */
    plugin: ResolvedPluginIdentity;
    config: PluginConfigView;
    /** The acting user, or null for unauthenticated / system contexts. */
    user: User | null;
    /**
     * The acting user's role, or null outside a request context. Fixed when the
     * context is built, and passed straight to `scopedServices`.
     */
    role: Role | null;
    /**
     * The connecting address, set by the HTTP transport when the runtime exposes
     * one it can trust. Absent for a CLI, MCP or in-process caller, and absent
     * over HTTP where no trustworthy source exists — so it is an identity to
     * meter traffic by, never proof of who the caller is.
     */
    clientAddress?: string | undefined;
    /**
     * The GLOBAL entries service — not scoped, not qualified. A plugin addresses
     * its own types explicitly, built from context rather than an import:
     * `` ctx.entries.query({ type: `${ctx.plugin.namespace}/redirect` }) ``.
     * Reads default to the `full` shape (plugin altitude is trusted server code);
     * an explicit per-call `full` still wins. No permission checks — HTTP is the
     * enforcement boundary.
     */
    entries: TypedEntriesService;
    /**
     * The GLOBAL globals service — not scoped, not qualified, the way
     * `entries` is. A plugin addresses its own globals by the qualified key it
     * builds from context: ``ctx.globals.get({ key: `${ctx.plugin.namespace}/settings` })``.
     * Reads default to the `full` shape (plugin altitude is trusted server
     * code); an explicit per-call `full` still wins. No permission checks —
     * HTTP is the enforcement boundary.
     */
    globals: TypedGlobalsService;
    /** The global media service. */
    media: MediaService;
    /** The global settings service. Reads default to the `full` shape. */
    settings: SettingsService;
    /** The global users service. */
    users: UsersService;
    /** The global notifications service (session-scoped). */
    notifications: NotificationsService;
    /** Other plugins' service methods — `ctx.plugins.<serviceKey>.<method>(input)`. */
    plugins?: PluginServiceNamespace | undefined;
    /** Email port — the element is rendered here, and an unconfigured driver throws. */
    email: PluginEmail;
    notify: (input: NotifyInput) => Promise<void>;
    logger: PluginLogger;
    /** Env vars (resolved via import.meta.env in Vite/Astro SSR). Never the browser. */
    env: Record<string, string | undefined>;
    /**
     * Run `event`'s handlers in registration order, replacing the payload with
     * any non-`undefined` return; a handler throw propagates to the caller
     * (`DECISIONS.md`).
     */
    runHook: <E extends HookEvent>(
        event: E,
        payload: HookPayloadFor<E>
    ) => Promise<HookPayloadFor<E>>;
    /** Storage scoped to this plugin — keys are namespaced under `plugin/<alias>/` transparently. */
    storage: PluginStorage;
    /** Database maintenance capabilities (feature-detected per driver). Distinct from `db` (the query instance). */
    database: PluginDatabase;
    /**
     * The method manifest, scoped to the plugin. A plugin cannot import
     * `astromech/methods`, so the dispatch surface arrives here instead.
     */
    methods: PluginMethods;
};

/**
 * Access policy for a plugin service method or raw route. There is no
 * default — omitting `access` is a build error (the field is required).
 */
export type PluginAccess = 'public' | 'authenticated' | { permission: string };

export type ServiceMethod<Input = unknown, Output = unknown> = {
    access: PluginAccess;
    handler: (input: Input, ctx: PluginContext) => Promise<Output> | Output;
    /** One-line summary for the method manifest (discovery / MCP / AI tool-loop). */
    summary?: string;
    /**
     * Zod schema for the call input — how the method is called, which is what
     * the manifest publishes to MCP and the AI tool-loop. Optional, but without
     * it a caller that isn't reading the plugin's TypeScript has no schema.
     */
    input?: z.ZodType<Input>;
    /** Zod schema for the result, where worth declaring. */
    output?: z.ZodType<Output>;
    // The effect declaration is MANDATORY (`ServiceMethodEffect` requires
    // `mutates`; `destructive`/`idempotent` stay optional). An undeclared effect
    // used to fall back to "mutating", which silently mislabelled pure reads in
    // the method manifest and so in MCP; it is now a compile error instead.
} & ServiceMethodEffect;

/**
 * Collection element for a plugin's service record: variance-safe over any
 * concrete method. `Input` is contravariant in `handler` (hence `never`) but
 * covariant in `input`, so the schema position is widened separately — a single
 * type argument cannot satisfy both.
 */
export type AnyServiceMethod = Omit<ServiceMethod<never, unknown>, 'input'> & {
    input?: z.ZodType;
};

/**
 * Map a plugin's service object type to its caller-facing callable signatures.
 * A method declared with an `undefined` input takes no argument, so its
 * parameter is optional and `.method()` is a legal bare call.
 */
export type ServiceInterface<T> = {
    [K in keyof T]: T[K] extends ServiceMethod<infer I, infer O>
        ? undefined extends I
            ? (input?: I) => Promise<O>
            : (input: I) => Promise<O>
        : (input?: unknown) => Promise<unknown>;
};

/**
 * Augmented by plugins' own `.d.ts` via `declare module 'astromech'`: each
 * installed plugin's access key maps to its service method signatures. Empty
 * by default; plugins self-augment using `ServiceInterface<typeof service>`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechPluginServices {}

/**
 * Plugin service methods only. A plugin's ENTRY types are NOT reachable here —
 * they live on the one entries service, addressed by their qualified id
 * (`Astromech.entries.query({ type: 'redirects/redirect' })`). Two entry points
 * to the same content was the problem, not a feature.
 */
export type PluginServiceNamespace = AstromechPluginServices &
    Record<string, Record<string, (input?: unknown) => Promise<unknown>>>;

/**
 * Raw request handler for payloads RPC-JSON can't carry (binary / multipart /
 * streaming). Mounted inside `${basePath}/api/plugins/{name}/*`.
 */
export type PluginRawRoute = {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** Path relative to `${basePath}/api/plugins/{name}`, e.g. `/upload`. */
    path: string;
    access: PluginAccess;
    handler: (request: Request, ctx: PluginContext) => Promise<Response> | Response;
};

export type PluginCronJob = {
    name: string;
    schedule: string;
    handler: (ctx: PluginContext) => Promise<void> | void;
};

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
    typeGen?: (field: Field) => string | null;
    /**
     * Server-side validator — the type-intrinsic rule for this custom field,
     * enforced by the field pipeline on every mutation (not just the browser).
     * Async; returns `true` when valid or an error message string. Wired into
     * the pipeline in P2/P3.
     */
    serverValidate?: FieldValidator;
};

/**
 * What a plugin declares about itself, and nothing more. `package` is the one
 * canonical identifier — the namespace behind every table prefix, permission
 * string, i18n bundle and service key is derived from it mechanically, and
 * cannot be declared or overridden.
 *
 * Identity is declared inline in the plugin's `definePlugin` call, alongside
 * everything else the plugin contributes — a plugin never passes its own
 * identity to itself:
 *
 * ```ts
 * export const redirects = definePlugin({
 *     package: '@astromech/redirects',
 *     version: '0.1.0',
 *     label: 'Redirects',
 *     icon: 'Signpost',
 *     // ...the rest of the definition...
 * });
 * ```
 *
 * `definePluginTable` still takes a package name directly, because it needs
 * that string as a *literal type* to derive a table name for `PluginDB` — a
 * value declared inside the definition can't reach a module-scope table.
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
    /**
     * Base for resolving this plugin's *relative* asset specifiers (`'./admin/
     * pages/overview.tsx'`) on `fields`, `admin.pages`, `admin.slots` and
     * `i18n`. Declared once here so no sub-module has to build a path.
     *
     * Pass `import.meta.url` from the module holding the definition; an
     * in-tree or otherwise unpublished plugin needs this, because its assets
     * have no package specifier to resolve through. Omit it for a published
     * package and relative specifiers resolve to `<package>/<path>` instead —
     * the subpath the package exports them under.
     *
     * Absolute and bare specifiers are passed through untouched, so an asset
     * that lives outside the plugin can still be named directly.
     */
    root?: string;

    // Declarative surfaces
    /**
     * The permission keys this plugin makes grantable, declared with
     * `definePermissions` — a flat record of **bare** keys (no `:`), which core
     * namespaces to `plugin:<namespace>:<key>` at registration.
     *
     * ```ts
     * permissions: definePermissions({
     *     read: { label: 'View backups' },
     *     restore: { label: 'Restore from backup' },
     * })
     * ```
     *
     * It feeds two consumers: the factory's `permissions(...)` grant accessor,
     * which a site spreads into a role, and the permission catalogue
     * (`astromech permissions`). Entry permissions are NOT declared here — core
     * derives them from the plugin's registered entry types.
     */
    permissions?: PermissionDeclarations;
    /** Entry types contributed by the plugin. Each self-declares its `type`. */
    entries?: EntryType[];
    /**
     * Globals contributed by the plugin. Each is addressed as
     * `<namespace>/<key>` on the one globals service.
     */
    globals?: GlobalConfig[];
    fields?: PluginFieldTypeRegistration[];
    /**
     * Tables shipped by the plugin (create via
     * `definePluginTable`; names are `plugin_<namespace>_` prefixed).
     */
    tables?: Table[];
    /**
     * The plugin's own migration provider — the `migrations/index.ts` generated
     * by `astromech plugin:generate`. Merged into the app's migration chain at
     * apply time under `plugin_<namespace>_`-prefixed names, so the plugin's own
     * files keep their bare `NNNN_<tag>` names.
     */
    migrations?: MigrationProvider;
    service?: Record<string, AnyServiceMethod>;
    rawRoutes?: PluginRawRoute[];
    hooks?: PluginHooks;
    /**
     * Custom events this plugin fires via `ctx.runHook`. Type-augmented in 18b
     * so a subscriber's payload type is checked against `AstromechPluginHookEvents`.
     */
    hookEvents?: string[];
    cron?: PluginCronJob[];
    admin?: PluginAdmin;
    /**
     * Admin-UI locale resources. Namespace = the derived plugin namespace.
     *
     * Usually just the locale codes — `['en', 'fr']` — which expand to
     * `./locales/<code>.json` and resolve against {@link PluginDefinition.root}
     * like any other asset. Pass a `{ locale: specifier }` map instead when the
     * bundles don't follow that layout. Values are import specifiers (STRINGS)
     * so the code-gen virtual module can emit lazy `import()` calls (spec §11).
     */
    i18n?: string[] | Record<string, string>;
    requiredEnv?: string[];
    /** Package name → semver range. Existence + basic range check only. */
    dependsOn?: Record<string, string>;
    emails?: EmailTemplateOverride[];

    // Imperative escape hatch
    /** Runs once per runtime boot. Optional. */
    setup?: (ctx: PluginContext) => void | Promise<void>;
};

/**
 * What `definePlugin` returns and a plugin package exports. Calling it yields
 * the definition a site places in `config.plugins`; `permissions(...keys)`
 * selects keys from the definition's `permissions` declaration and returns them
 * fully namespaced, so a site composes roles without importing anything else
 * from the package — and enumerates exactly what it grants.
 *
 * `Def` is the definition's own type, which is what keeps the keys literal —
 * `seo.permissions('view')` type-checks, `seo.permissions('viwe')` does not.
 */
export type PluginFactory<
    Options = void,
    Def extends PluginDefinition = PluginDefinition,
> = ((options?: Options) => Def) & {
    permissions: (
        ...keys: (Def extends { permissions: infer P } ? keyof P & string : string)[]
    ) => Permission[];
};

/**
 * Fully-derived plugin identity, computed once during config resolution.
 *
 * `namespace` is the string form and the only namespace there is — table
 * prefix, i18n bundle, HTTP route segment and permission strings all use it.
 * `permissionNamespace` is the same string, kept as its own field because
 * permission call sites read better naming what they anchor to.
 * `serviceKey` is the camelCase form, used only where a JS property key is
 * required (`ctx.plugins.acmeSeo`, `Astromech.plugins.acmeSeo`).
 */
export type ResolvedPluginIdentity = {
    package: string;
    namespace: string;
    serviceKey: string;
    permissionNamespace: string;
    version?: string;
};
