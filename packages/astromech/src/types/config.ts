/**
 * Configuration types — collection config, drivers, Astromech config
 */

import type { AiConfig } from './ai';
import type { Permission, Role } from './domain';
import type {
    EntryFields,
    Field,
    Label,
    ResolvedEntryFields,
    ResourceValidator,
} from './fields';
import type { PluginDefinition, PluginNavItem } from './plugins';
import type { CellKind } from './resolved';
import type { DB } from '@/database/types';
import type { EntryRepository } from '@/entries/repository/types';
import type { ImageFormat } from '@/media/serving/image/url.shared';
import type { Dialect, Kysely } from 'kysely';

export type DbDump = {
    /** Raw bytes of a consistent SQLite snapshot. */
    stream: ReadableStream<Uint8Array>;
    /** Release temp resources (e.g. delete the temp dump file). Always call when done. */
    cleanup: () => Promise<void>;
};

export type DatabaseDriver = {
    type: string;
    getInstance(): Kysely<DB>;
    /**
     * A fresh, plugin-free Kysely dialect. better-auth builds its own Kysely
     * instance and must not inherit the `CamelCasePlugin` the main instance
     * uses, so it needs its own dialect rather than the shared instance. Each
     * call returns a new dialect.
     */
    createDialect(): Dialect;
    /**
     * Whether the driver supports interactive transactions (`BEGIN`/`COMMIT`
     * across round-trips). Absent or `true` means yes. Cloudflare D1 has no
     * interactive transactions — only `batch()` — so it declares `false`, and
     * domains that can degrade (entry storage) drop their transaction method
     * rather than pretending.
     */
    supportsTransactions?: boolean;
    /**
     * Whether this driver talks to a database the developer's machine does not
     * own. Optional and feature-detected: a driver that cannot tell omits it and
     * the CLI treats the database as local.
     */
    isRemote?(): boolean;
    /** Produce a consistent full-DB snapshot. Optional — absent on drivers that can't dump in-process (e.g. D1). */
    dump?(): Promise<DbDump>;
    /** Restore a full-DB snapshot from raw SQLite bytes. `preserve` = table names to leave untouched. Optional. */
    restore?(
        source: ReadableStream<Uint8Array>,
        opts: { preserve: string[] }
    ): Promise<void>;
};

export type StorageRange = {
    /** Byte offset of the first byte to return. */
    offset: number;
    /** Bytes to return. Omit for "to the end of the object". */
    length?: number;
};

export type StorageObject = {
    body: ReadableStream;
    /** Bytes in `body` — less than `totalSize` for a ranged read. */
    size: number;
    /** Full object size, regardless of range. Needed to emit `Content-Range`. */
    totalSize: number;
    contentType?: string;
    etag?: string;
};

export type StorageStat = {
    size: number;
    contentType?: string;
    etag?: string;
    uploadedAt?: Date;
};

export type StorageList = {
    keys: string[];
    /** Present when more keys remain. Pass back to continue. */
    cursor?: string;
};

export type StorageDriver = {
    name: string;

    put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: { contentType?: string }
    ): Promise<void>;
    get(key: string, opts?: { range?: StorageRange }): Promise<StorageObject | null>;
    stat(key: string): Promise<StorageStat | null>;
    delete(key: string): Promise<void>;
    list(
        prefix: string,
        opts?: { cursor?: string; limit?: number }
    ): Promise<StorageList>;

    // Optional capabilities, feature-detected at the call site. Detection is
    // load-bearing, not politeness: an R2 binding cannot sign URLs at all and
    // `filesystem()` cannot either, so these are genuinely absent on shipped
    // drivers. Never assume a method exists.
    /** Permanent, cacheable, CDN-frontable URL. Null when the driver has none. */
    getPublicUrl?(key: string): string | null;
    /** Time-limited upload URL for direct client uploads. */
    getSignedUploadUrl?(
        key: string,
        opts: { expiresIn: number; contentType?: string }
    ): Promise<string>;
    /** Time-limited download URL. */
    getSignedDownloadUrl?(key: string, opts: { expiresIn: number }): Promise<string>;
};

export type ImageSource = {
    contentType: string;
    getBytes(): Promise<Uint8Array>;
    originUrl: string;
};

export type ImageDriver = {
    name: string;
    transform(
        src: ImageSource,
        opts: { width: number; format: ImageFormat }
    ): Promise<{ body: ReadableStream | Uint8Array; contentType: string }>;
    placeholder?(bytes: Uint8Array): Promise<string | null>;
    cachesVariants?: boolean;
};

export type ImageConfig = {
    driver: ImageDriver;
    widths?: number[];
    avif?: boolean;
};

/** No `from` — the driver supplies the envelope sender it was configured with. */
export type EmailMessage = {
    to: string;
    subject: string;
    html: string;
    text?: string;
};

export type EmailDriver = {
    name: string;
    send(message: EmailMessage): Promise<void>;
};

export type SchedulerDriver = {
    readonly name: string;
    /** Begin producing ticks; each tick invokes onTick(now). */
    start(onTick: (now: Date) => Promise<void>): void | Promise<void>;
    stop?(): void | Promise<void>;
};

export type SlugConfig = {
    source?: string;
    unique?: boolean;
    prefix?: string;
};

export type AdminColumn = {
    field: string;
    label?: Label;
    sortable?: boolean;
    kind?: CellKind;
};

export type VersioningConfig = {
    maxVersions?: number;
};

export type EntryType = {
    /**
     * Type key. Plugin entry types self-declare this so they can be listed in
     * the plugin `entries` array; root config entry types are keyed by the
     * `entries` record and leave this unset.
     */
    type?: string;
    /**
     * Field tree for this entry type. Either a flat list (single column) or an
     * explicit `{ main, sidebar }` two-column split. Layout fields
     * (`section`/`tabs`/`tab`/`accordion`) are field types within the tree.
     */
    fields?: EntryFields;
    versioning?: boolean | VersioningConfig;
    /**
     * Whether this entry type supports forward versioning (preparing, previewing
     * and merging a future "staged" version of a live entry). Default off, and
     * independent of `versioning`. Requires built-in storage.
     */
    staging?: boolean;
    translatable?: boolean;
    /**
     * Disable slug generation for this entry type by setting `false`.
     * Defaults are storage-dependent; built-in storage defaults slug ON.
     */
    slug?: SlugConfig | false;
    /**
     * Whether entries have status (unpublished/published/scheduled).
     * Defaults are storage-dependent; built-in storage defaults statuses ON.
     */
    statuses?: boolean;
    /**
     * Whether entries can be soft-deleted (trashed).
     * Defaults are storage-dependent; built-in storage defaults trash ON.
     */
    trash?: boolean;
    /**
     * Which field to use as the entry title.
     * Defaults are storage-dependent; built-in storage defaults titleField 'title'.
     * Set `false` to make the entry titleless.
     */
    titleField?: 'title' | false;
    single: string;
    plural: string;
    /**
     * Lucide icon name (e.g. `'FileText'`) shown for this entry type in the
     * admin sidebar and quick-create menu. Defaults to a database icon.
     */
    icon?: string;
    adminColumns?: AdminColumn[];
    views?: ('list' | 'grid')[];
    defaultView?: 'list' | 'grid';
    gridFields?: { field: string; label?: string }[];
    /**
     * Front-end URL template for an entry, e.g. `/blog/{slug}`. Tokens: `{slug}`
     * and `{fieldName}`. Powers the admin "View" link and redirect generation.
     */
    url?: string;
    /**
     * Custom repository backend for this entry type; absent means built-in
     * repository. Stripped from the resolved config (a live instance cannot be
     * serialised into the virtual module) and registered into the repository
     * registry at boot, under the bare type name for a host type and the
     * qualified `{plugin}/{type}` id for a plugin's.
     */
    repository?: EntryRepository;
    /** Field names a multi-type storage should index for free-text search. */
    search?: string[];
    /**
     * Cross-field validator for the whole entry, run after every field has been
     * processed. Server-side only — it is a function, so it cannot cross into
     * the admin's JSON config.
     */
    validate?: ResourceValidator;
};

export type ResolvedEntryCapabilities = {
    statuses: boolean;
    slug: boolean;
    translatable: boolean;
    versioning: boolean;
    staging: boolean;
    trash: boolean;
};

export type ResolvedEntryType = Omit<EntryType, 'repository' | 'fields' | 'type'> & {
    /** The addressable id: the root `entries` key, or `{plugin}/{type}` for plugin types. */
    id: string;
    capabilities: ResolvedEntryCapabilities;
    titleField: 'title' | false;
    fields: ResolvedEntryFields;
};

export type TrashConfig = {
    enabled?: boolean;
    retentionDays?: number;
};

export type RoleConfig = {
    name: string;
    permissions: Permission[];
};

/**
 * How media is delivered. `'public'` serves direct driver URLs where the driver
 * offers them; `'private'` never hands one out, so every request goes through
 * the media route.
 *
 * `'private'` is NOT access control today: the media route serves any valid
 * media id to anyone. It exists so bytes stay behind a route we own, which is
 * the prerequisite for authorising them — not the authorisation itself.
 */
export type MediaAccess = 'public' | 'private';

export type MediaConfig = {
    fields?: Field[];
    /** How media is delivered. Default: `'public'`. */
    access?: MediaAccess;
    /**
     * The image transform driver plus core's variant allow-list. Absent means
     * originals are served unchanged.
     */
    image?: ImageConfig;
    /**
     * Cross-field validator for a media record, run after every field has been
     * processed. Server-side only — it is a function, so it cannot cross into
     * the admin's JSON config.
     */
    validate?: ResourceValidator;
};

/**
 * `MediaConfig` with its defaults applied. `image` is absent: it holds a live
 * driver, and this shape is `Pick`ed into `PluginConfigView`, so leaving it in
 * would hand every plugin the `ImageDriver`. Read it from the image registry.
 */
export type ResolvedMediaConfig = Omit<MediaConfig, 'access' | 'image'> & {
    access: MediaAccess;
};

export type UsersConfig = {
    fields?: Field[];
    /**
     * Cross-field validator for a user record, run after every field has been
     * processed. Server-side only — it is a function, so it cannot cross into
     * the admin's JSON config.
     */
    validate?: ResourceValidator;
};

/**
 * One shape for host + plugin pages. Exactly one of `fields` / `component`
 * must be provided (validated crash-loud at config resolution).
 *
 * - Host: authored into `admin.pages`; path is the route + storage key.
 * - Plugin: authored into `PluginDefinition.admin.pages`; path is relative to
 *   `${basePath}/plugin/<name>`.
 */
export type AdminPage = {
    path: string;
    label: Label;
    icon?: string;
    /** MODE A: managed settings form (full EntryFields tree). */
    fields?: EntryFields;
    /** MODE B: custom React component (import specifier string). */
    component?: string;
    /** Settings-form mode only; default false. */
    translatable?: boolean;
    /**
     * Settings-form mode only. Cross-field validator for the page's values, run
     * after every field has been processed. Server-side only — it is a
     * function, so it cannot cross into the admin's JSON config.
     */
    validate?: ResourceValidator;
    /**
     * Permission override. Host default: `'settings:read'`. Plugin default:
     * `'settings:read'` for settings pages, null for component pages.
     * Bare keys on plugin pages are auto-namespaced.
     */
    permission?: string;
    /** Whether this page appears in the sidebar. Default true. */
    nav?: boolean;
    /**
     * When true, the settings stored under this page's `baseKey` (and any
     * per-locale variants `baseKey:<locale>`) are readable without
     * authentication. Default: false (private). Opt-in — must be explicit.
     */
    public?: boolean;
};

/** Named admin-shell slots a plugin can contribute persistent UI into. */
export type AdminSlotName = 'global-overlay' | 'right-drawer' | 'toolbar';

/** A plugin contribution mounted into a named admin-shell slot. */
export type AdminSlotContribution = {
    /** Which named admin-shell slot to mount into. */
    slot: AdminSlotName;
    /** Import specifier for the React component (browser, lazy-loaded). */
    component: string;
    /** Stable id for keying/dedup. Defaults to `${plugin}:${slot}:${index}`. */
    id?: string;
    /** Render order within the slot, ascending. Defaults to 0. */
    order?: number;
    /** Plugin-relative permission key gating visibility (resolved via namespace). */
    permission?: string;
};

/**
 * Origin-erased resolved shape. Both host and plugin derivation produce this;
 * the renderer never needs to know the origin.
 */
export type ResolvedAdminPage = {
    /** Route splat key — host: `path`; plugin: `'<name><path>'`. */
    key: string;
    path: string;
    label: Label;
    icon?: string;
    /** Settings storage base — host: `'<path>'`; plugin: `'plugin:<ns>:<path>'`. */
    baseKey: string;
    /** Resolved field tree; null in component mode. */
    fields: ResolvedEntryFields | null;
    /** Lazy-import registry key; null in settings mode. */
    componentKey: string | null;
    translatable: boolean;
    permission: string | null;
    nav: boolean;
    /**
     * Whether settings under this page's baseKey are publicly readable
     * (no auth required). Mirrors the authored `AdminPage.public` flag.
     */
    public: boolean;
};

/** The config object passed to `defineConfig`. */
export type AstromechConfig = {
    db: DatabaseDriver;
    storage: StorageDriver;
    /** URL prefix for the admin panel; the API is served at `${basePath}/api`. Default `/cms`. */
    basePath?: string;
    mediaRoute?: string;
    entries: Record<string, EntryType>;
    admin?: {
        pages?: AdminPage[];
    };
    /**
     * Setting keys readable without authentication. Complements the page-level
     * `public` flag on `AdminPage`. Keys not listed here (and not on a public
     * admin page) are private by default.
     *
     * A bare key exposes the key itself and every `<key>:<locale>` variant, the
     * same pair a `public: true` admin page derives. An entry already ending
     * with `:` is a prefix and is taken as written.
     *
     * Example: `['site-meta']` allows `'site-meta'` and `'site-meta:en'`.
     */
    publicSettings?: string[];
    media?: MediaConfig;
    users?: UsersConfig;
    roles?: Record<string, RoleConfig>;
    defaultRole?: string;
    plugins?: PluginDefinition[];
    trash?: TrashConfig;
    /** Email sending. The driver carries its own `from`; absent means no email. */
    email?: EmailDriver;
    /** Model access. Absent unless configured; see `getModel`. */
    ai?: AiConfig;
    /** Triggering driver for scheduled jobs. Default: `interval()`. */
    scheduler?: SchedulerDriver;
    /**
     * IANA timezone used to interpret cron expressions (e.g. '0 3 * * *' =
     * 3am in this zone). Instants are still stored/compared as UTC. Default 'UTC'.
     */
    timezone?: string;
    locales?: string[];
    defaultLocale?: string;
    cors?: {
        /** Additional allowed origins beyond same-origin. Exact domain matches only. */
        origins: string[];
    };
    security?: {
        /** Override individual secure header values. */
        headers?: {
            xContentTypeOptions?: string;
            xFrameOptions?: string;
            referrerPolicy?: string;
            permissionsPolicy?: string;
        };
        /**
         * Whether `x-forwarded-for` may be read for the client address. Default
         * `false` — on a directly exposed server any client can send the header.
         *
         * Each proxy appends the peer it received the request from, so the
         * rightmost entries come from infrastructure and the leftmost is
         * whatever the client sent — counting from the right is the only safe
         * reading. The value is how many proxies sit between the client and this
         * server (`true` means one) and must match the real chain: with `n`
         * trusted proxies the client's address is the `n`th entry from the end.
         * Too high yields no address rather than a less trusted one.
         */
        trustProxy?: TrustProxy;
    };
};

/** `false` to never read `x-forwarded-for`, `true` for one proxy, or a hop count. */
export type TrustProxy = boolean | number;

/**
 * `AstromechConfig` with its defaults applied, minus every capability that is
 * one shared resource for the whole app: those are declared in config and
 * reached from their registry, never off the config. `plugins` is not a driver
 * but is stripped too — the raw `PluginDefinition[]` carries live functions.
 */
export type ResolvedConfig = Omit<
    AstromechConfig,
    'db' | 'storage' | 'email' | 'scheduler' | 'ai' | 'plugins'
> & {
    basePath: string;
    mediaRoute: string;
    entries: Record<string, ResolvedEntryType>;
    /** Always present — `access` defaults to `'public'`. */
    media: ResolvedMediaConfig;
    /**
     * Plugin-contributed entry types, namespaced by plugin name → bare type →
     * resolved config. Always present (empty when no plugins contribute types).
     */
    pluginEntries: Record<string, Record<string, ResolvedEntryType>>;
    adminPages: ResolvedAdminPage[];
    trash: Required<TrashConfig>;
    /**
     * Derived set of setting keys (exact) and prefixes (ending with `:`) that
     * are publicly readable. Computed once at config resolution from:
     *   1. Admin pages with `public: true` → their `baseKey` and `baseKey:` prefix.
     *   2. `AstromechConfig.publicSettings` → the same pair per bare entry; an
     *      entry already ending with `:` is kept as written.
     * Always present (empty array when nothing is public).
     */
    publicSettingKeys: string[];
    /**
     * Built-in roles merged with `roles`, keyed by slug. Computed once at config
     * resolution so a lookup does not rebuild the map.
     */
    resolvedRoles: Record<string, Role>;
    timezone: string;
};

/** Admin Config — the virtual-module shape exposed to the admin SPA. */
export type AdminConfig = {
    /** URL prefix for the admin panel; the API is served at `${basePath}/api`. */
    basePath: string;
    /** Where `/_media` variants are served from, so the admin can build thumbnail URLs. */
    mediaRoute: string;
    /**
     * The image variant allowlist. Empty when no image driver is configured —
     * the admin then falls back to the original file rather than requesting a
     * width the media route would 404.
     */
    imageWidths: number[];
    imageAvif: boolean;
    locales: string[];
    defaultLocale: string;
    roles: { slug: string; name: string }[];
    entries: Record<string, AdminEntryType>;
    /** Host-defined admin pages (settings form or custom component). */
    pages: ResolvedAdminPage[];
    /** Static plugin metadata for the admin shell (serializable only). */
    plugins: {
        /** The plugin's derived namespace — admin URL segment and page-key prefix. */
        namespace: string;
        /**
         * The plugin's derived service key — the `Astromech.plugins.<key>`
         * property and the API route segment. Carried explicitly rather than
         * derived from `namespace` in the browser: that derivation is lossy in
         * reverse.
         */
        serviceKey: string;
        /** Display name — sidebar group and page-title prefix. */
        label: string;
        /** Anchors permission strings and settings keys. */
        permissionNamespace: string;
        /** Sidebar tree derived from nav-visible pages. */
        nav: PluginNavItem[];
        /**
         * Plugin-contributed entry types, keyed by bare type. Same single-type
         * shape as root `entries`, so the shared entry page components consume
         * either without divergence.
         */
        entries: Record<string, AdminEntryType>;
        /** Page metadata: unified ResolvedAdminPage (origin-erased). */
        pages: ResolvedAdminPage[];
    }[];
};

/** Single entry-type admin config, shared by root and plugin entry types. */
export type AdminEntryType = {
    single: string;
    plural: string;
    /** Lucide icon name for sidebar / quick-create; absent falls back to a database icon. */
    icon?: string;
    versioning: boolean;
    translatable: boolean;
    slug: SlugConfig | null;
    adminColumns: AdminColumn[];
    fields: ResolvedEntryFields;
    views?: ('list' | 'grid')[];
    defaultView?: 'list' | 'grid';
    gridFields?: { field: string; label?: string }[];
    url: string | null;
    capabilities: ResolvedEntryCapabilities;
    titleField: 'title' | false;
    /** Field names a multi-type storage indexes for free-text search. */
    search?: string[];
};
