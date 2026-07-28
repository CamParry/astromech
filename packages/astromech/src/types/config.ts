/**
 * Configuration types — collection config, drivers, Astromech config
 */

import type { Client } from '@libsql/client';
import type { Kysely } from 'kysely';
import type { DB } from '@/database/types.js';
import type { CellKind } from './definitions.js';
import type { Permission } from './domain.js';
import type {
    EntryFields,
    FieldDefinition,
    Label,
    ResolvedEntryFields,
} from './fields.js';
import type { PluginDefinition, PluginNavItem } from './plugins.js';
import type { EntryStorage } from '@/entries/storage/types.js';
import type { ImageFormat } from '@/media/serving/image/url.js';

// ============================================================================
// Drivers
// ============================================================================

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
     * Shared libsql `Client` backing better-auth's Kysely adapter and
     * dump/restore. Optional — absent on drivers without an in-process client
     * (e.g. D1).
     */
    getClient?(): Client;
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

    // --- required ---
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

    // --- optional capabilities, feature-detected at the call site ---
    // Detection is load-bearing, not politeness: an R2 binding cannot sign URLs
    // at all and `filesystem()` cannot either, so these are genuinely absent on
    // shipped drivers. Never assume a method exists.
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

export type EmailMessage = {
    to: string;
    from: string;
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

// ============================================================================
// Entry Types
// ============================================================================

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

export type EntryTypeConfig = {
    /**
     * Type key. Plugin entry types self-declare this so they can be listed in
     * the plugin `entries` array; root config entry types are keyed by the
     * `entries` record and leave this unset.
     */
    type?: string;
    /**
     * Field tree for this entry type. Either a flat list (single column) or an
     * explicit `{ main, sidebar }` two-column split. Layout containers
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
     * Custom storage backend for this entry type. Plugin entry types may mount
     * their own storage; absent means built-in storage. Stripped from the
     * resolved config (a live instance cannot be serialised into the virtual
     * module) and registered into the storage registry at boot.
     */
    storage?: EntryStorage;
    /** Field names a multi-type storage should index for free-text search. */
    search?: string[];
};

export type ResolvedEntryCapabilities = {
    statuses: boolean;
    slug: boolean;
    translatable: boolean;
    versioning: boolean;
    staging: boolean;
    trash: boolean;
};

export type ResolvedEntryTypeConfig = Omit<EntryTypeConfig, 'storage' | 'fields'> & {
    capabilities: ResolvedEntryCapabilities;
    titleField: 'title' | false;
    fields: ResolvedEntryFields;
};

// ============================================================================
// Configuration
// ============================================================================

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
    fields?: FieldDefinition[];
    /** How media is delivered. Default: `'public'`. */
    access?: MediaAccess;
};

/** `MediaConfig` with its defaults applied. */
export type ResolvedMediaConfig = Omit<MediaConfig, 'access'> & {
    access: MediaAccess;
};

export type UsersConfig = {
    fields?: FieldDefinition[];
};

// ============================================================================
// Unified Admin Pages (host + plugin, settings form or custom component)
// ============================================================================

/**
 * One shape for host + plugin pages. Exactly one of `fields` / `component`
 * must be provided (validated crash-loud at config resolution).
 *
 * - Host: authored into `admin.pages`; path is the route + storage key.
 * - Plugin: authored into `PluginDefinition.admin.pages`; path is relative to
 *   `/admin/plugin/<name>`.
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

export type AstromechConfig = {
    db: DatabaseDriver;
    storage: StorageDriver;
    adminRoute?: string;
    apiRoute?: string;
    mediaRoute?: string;
    image?: ImageConfig;
    entries: Record<string, EntryTypeConfig>;
    admin?: {
        pages?: AdminPage[];
    };
    /**
     * Bare setting keys (or key prefixes ending with `/`) that are readable
     * without authentication. Complements the page-level `public` flag on
     * `AdminPage`. Keys not listed here (and not on a public admin page) are
     * private by default.
     *
     * Example: `['site-meta', 'theme/']` allows `'site-meta'` and any key
     * starting with `'theme/'`.
     */
    publicSettings?: string[];
    media?: MediaConfig;
    users?: UsersConfig;
    roles?: Record<string, RoleConfig>;
    defaultRole?: string;
    plugins?: PluginDefinition[];
    trash?: TrashConfig;
    email?: {
        driver: EmailDriver;
        from: string;
    };
    /** Triggering driver for scheduled jobs. Default: nodeDriver. */
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
    };
};

export type ResolvedConfig = Omit<AstromechConfig, 'plugins' | 'db' | 'scheduler'> & {
    adminRoute: string;
    apiRoute: string;
    mediaRoute: string;
    entries: Record<string, ResolvedEntryTypeConfig>;
    /** Always present — `access` defaults to `'public'`. */
    media: ResolvedMediaConfig;
    /**
     * Plugin-contributed entry types, namespaced by plugin name → bare type →
     * resolved config. Always present (empty when no plugins contribute types).
     */
    pluginEntries: Record<string, Record<string, ResolvedEntryTypeConfig>>;
    adminPages: ResolvedAdminPage[];
    trash: Required<TrashConfig>;
    /**
     * Derived set of setting keys (exact) and prefixes (ending with `/`) that
     * are publicly readable. Computed once at config resolution from:
     *   1. Admin pages with `public: true` → their `baseKey` and `baseKey:` prefix.
     *   2. `AstromechConfig.publicSettings` → verbatim.
     * Always present (empty array when nothing is public).
     */
    publicSettingKeys: string[];
    timezone: string;
};

// ============================================================================
// Admin Config (virtual module shape exposed to admin SPA)
// ============================================================================

export type AdminConfig = {
    adminRoute: string;
    apiRoute: string;
    locales: string[];
    defaultLocale: string;
    roles: { slug: string; name: string }[];
    entries: Record<string, AdminEntryTypeConfig>;
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
        entries: Record<string, AdminEntryTypeConfig>;
        /** Page metadata: unified ResolvedAdminPage (origin-erased). */
        pages: ResolvedAdminPage[];
    }[];
};

/** Single entry-type admin config, shared by root and plugin entry types. */
export type AdminEntryTypeConfig = {
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
