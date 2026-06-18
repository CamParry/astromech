/**
 * Configuration types — collection config, drivers, Astromech config
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
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
    getInstance(): LibSQLDatabase;
    /** Produce a consistent full-DB snapshot. Optional — absent on drivers that can't dump in-process (e.g. D1). */
    dump?(): Promise<DbDump>;
    /** Restore a full-DB snapshot from raw SQLite bytes. `preserve` = table names to leave untouched. Optional. */
    restore?(
        source: ReadableStream<Uint8Array>,
        opts: { preserve: string[] }
    ): Promise<void>;
};

export type StorageDriver = {
    name: string;
    put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: { contentType?: string }
    ): Promise<void>;
    get(
        key: string
    ): Promise<{ body: ReadableStream; size: number; contentType?: string } | null>;
    delete(key: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
    getDirectUrl?(key: string): string | null;
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
    translatable?: boolean;
    /**
     * Disable slug generation for this entry type by setting `false`.
     * Defaults are storage-dependent; built-in storage defaults slug ON.
     */
    slug?: SlugConfig | false;
    /**
     * Whether entries have status (draft/published/scheduled).
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

export type MediaConfig = {
    fields?: FieldDefinition[];
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
        /** Access key (resolved identity name). */
        name: string;
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
