/**
 * Configuration types: entry type config, drivers, Astromech config
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
import type { SortOption } from './query';
import type { CellKind } from './resolved';
import type { DB } from '@/database/types';
import type { ImageFormat } from '@/media/serving/image/url';
import type { Kysely } from 'kysely';

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
     * Whether the driver supports interactive transactions (`BEGIN`/`COMMIT`
     * across round-trips). Absent or `true` means yes. Cloudflare D1 has no
     * interactive transactions — only `batch()` — so it declares `false`, and
     * domains that can degrade (the entry repository) drop their transaction method
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
     * independent of `versioning`.
     */
    staging?: boolean;
    translatable?: boolean;
    /** Disable slug generation for this entry type by setting `false`. Default on. */
    slug?: SlugConfig | false;
    /** Whether entries have status (unpublished/published/scheduled). Default true. */
    statuses?: boolean;
    /** Whether entries can be soft-deleted (trashed). Default true. */
    trash?: boolean;
    /**
     * Which field to use as the entry title. Default `'title'`; `false` makes
     * the entry titleless.
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

export type ResolvedEntryType = Omit<EntryType, 'fields' | 'type'> & {
    /** The addressable id: the site's `entries` key, or `{plugin}/{type}` for a plugin's. */
    id: string;
    /** The namespace of the plugin that declares the type; absent for the site's own. */
    plugin?: string;
    capabilities: ResolvedEntryCapabilities;
    titleField: 'title' | false;
    fields: ResolvedEntryFields;
};

/**
 * One editor-owned, exactly-one, site-wide piece of content. Authored in the
 * top-level `globals` array or in a plugin's, the same shape in both places.
 */
export type GlobalConfig = {
    /** Unique across the site and every plugin's globals. No `/` or `:`. */
    key: string;
    label: Label;
    /** Lucide icon name for the sidebar. Defaults to a globe icon. */
    icon?: string;
    fields: EntryFields;
    /** Default false. */
    translatable?: boolean;
    /** Default true. `maxVersions` as for entry types. */
    versioning?: boolean | VersioningConfig;
    /** Default true. */
    statuses?: boolean;
    /** Default false. Requires `statuses`. */
    staging?: boolean;
    /** Unauthenticated `get` returns the published content. Default false. */
    public?: boolean;
    /** Show in the sidebar. Default true. */
    nav?: boolean;
    /**
     * Cross-field validator for the whole global, run after every field has
     * been processed. Server-side only — it is a function, so it cannot cross
     * into the admin's JSON config.
     */
    validate?: ResourceValidator;
};

/** A global's capability set with its defaults applied. */
export type ResolvedGlobalCapabilities = {
    statuses: boolean;
    translatable: boolean;
    versioning: boolean;
    staging: boolean;
};

/**
 * A resolved global. `versioning` keeps whatever the author wrote (including
 * `maxVersions`); whether versioning is on at all is `capabilities.versioning`,
 * as on entry types.
 */
export type ResolvedGlobal = Omit<GlobalConfig, 'key' | 'fields'> & {
    /** Bare `key` for a host global, `<namespace>/<key>` for a plugin's. */
    id: string;
    /** The namespace of the plugin that declares the global; absent for the site's own. */
    plugin?: string;
    capabilities: ResolvedGlobalCapabilities;
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
    /** Default false. Every locale in `locales` may hold its own content row. */
    translatable?: boolean;
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
    translatable: boolean;
};

export type UsersConfig = {
    fields?: Field[];
    /** Default false. Every locale in `locales` may hold its own content row. */
    translatable?: boolean;
    /**
     * Cross-field validator for a user record, run after every field has been
     * processed. Server-side only — it is a function, so it cannot cross into
     * the admin's JSON config.
     */
    validate?: ResourceValidator;
};

/** `UsersConfig` with its defaults applied. */
export type ResolvedUsersConfig = {
    fields: Field[];
    validate?: ResourceValidator;
    translatable: boolean;
};

/**
 * One shape for host + plugin pages. A page renders a React component; a
 * field-bearing destination is a global, not a page.
 *
 * - Host: authored into `admin.pages`; path is the route.
 * - Plugin: authored into `PluginDefinition.admin.pages`; path is relative to
 *   `${basePath}/plugin/<name>`.
 */
export type AdminPage = {
    path: string;
    label: Label;
    icon?: string;
    /** Import specifier for the React component the page renders. */
    component: string;
    /**
     * Permission gating the page. Default: none. A bare key on a plugin page is
     * auto-namespaced.
     */
    permission?: string;
    /** Whether this page appears in the sidebar. Default true. */
    nav?: boolean;
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
    /** Lazy-import registry key for the page's component. */
    componentKey: string;
    permission: string | null;
    nav: boolean;
};

/**
 * A list column of an admin resource: a top-level field name, or the name with
 * `sortable: true` when the list method accepts a sort on it.
 */
export type AdminResourceColumn = string | { field: string; sortable?: boolean };

/**
 * An admin resource: list, create and edit screens over a plugin's own service
 * methods, declared under `admin.resources`. Each method name is a key of the
 * plugin's `service`, and each such method declares `access: { permission }`.
 */
export type AdminResource = {
    /** The URL key, `/plugin/<namespace>/resources/<name>`: lowercase words joined by `-`. */
    name: string;
    /** The plural label: the sidebar item and the list's title. */
    label: Label;
    labelSingular: Label;
    /** Lucide icon name for the sidebar item. */
    icon?: string;
    /** The fields the create and edit forms render, and the columns name. */
    fields: Field[];
    /** The fields the list shows, in order. */
    columns: AdminResourceColumn[];
    /**
     * The service methods behind each view. Without `get` rows do not open, and
     * without `update` the edit screen is read-only.
     */
    methods: {
        list: string;
        get?: string;
        create?: string;
        update?: string;
        delete?: string;
    };
    /** Whether the resource appears in the sidebar. Default true. */
    nav?: boolean;
    /** Whether the list shows a search box, passed to the list method as `search`. Default false. */
    search?: boolean;
};

/** The id a resource row is addressed by, beside its field values. */
export type AdminResourceRow = { id: string } & Record<string, unknown>;

/** What a resource's `list` method receives; it answers a `QueryResult<AdminResourceRow>`. */
export type AdminResourceListInput = {
    search?: string | undefined;
    sort?: SortOption | undefined;
    /** The page, from 1. */
    page: number;
    limit: number;
};

/** What a resource's `get` method receives; it answers the row, or `null` when there is none. */
export type AdminResourceGetInput = { id: string };

/** What a resource's `create` method receives, the form's field values; it answers the row. */
export type AdminResourceCreateInput = { data: Record<string, unknown> };

/** What a resource's `update` method receives; it answers the saved row. */
export type AdminResourceUpdateInput = { id: string; data: Record<string, unknown> };

/** What a resource's `delete` method receives; its answer is ignored. */
export type AdminResourceDeleteInput = { id: string };

/** One of an admin resource's methods, with the permission it declares resolved. */
export type ResolvedAdminResourceMethod = {
    /** The method's key in the plugin's `service`. */
    name: string;
    permission: string;
};

/** An admin resource as the admin config carries it: columns normalised, permissions resolved. */
export type ResolvedAdminResource = {
    name: string;
    label: Label;
    labelSingular: Label;
    icon?: string;
    fields: Field[];
    columns: { field: string; sortable: boolean }[];
    search: boolean;
    methods: {
        list: ResolvedAdminResourceMethod;
        get?: ResolvedAdminResourceMethod;
        create?: ResolvedAdminResourceMethod;
        update?: ResolvedAdminResourceMethod;
        delete?: ResolvedAdminResourceMethod;
    };
};

/** The config object passed to `defineConfig`. */
export type AstromechConfig = {
    db: DatabaseDriver;
    storage: StorageDriver;
    /** URL prefix for the admin panel; the API is served at `${basePath}/api`. Default `/cms`. */
    basePath?: string;
    mediaRoute?: string;
    /**
     * The folder `db:generate` writes the app's migrations to and every migration
     * step reads, relative to the working directory. Default `./migrations`.
     */
    migrationsDir?: string;
    entries: Record<string, EntryType>;
    /** Site-wide globals, each self-contained with its own `key`. */
    globals?: GlobalConfig[];
    admin?: {
        pages?: AdminPage[];
    };
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
    'db' | 'storage' | 'email' | 'scheduler' | 'ai' | 'plugins' | 'entries' | 'globals'
> & {
    basePath: string;
    mediaRoute: string;
    migrationsDir: string;
    /** Every entry type, the site's and each plugin's, keyed by id. */
    entryTypes: Record<string, ResolvedEntryType>;
    /** Every global, the site's and each plugin's, keyed by id. */
    globals: Record<string, ResolvedGlobal>;
    /** Always present — `access` defaults to `'public'`. */
    media: ResolvedMediaConfig;
    /** Always present — `fields` defaults to empty and `translatable` to false. */
    users: ResolvedUsersConfig;
    adminPages: ResolvedAdminPage[];
    trash: Required<TrashConfig>;
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
    /** The media library's own settings. */
    media: {
        /** Whether a media item may hold a content row per locale. */
        translatable: boolean;
    };
    /** The users section's own settings. */
    users: {
        /** Whether a user may hold a content row per locale. */
        translatable: boolean;
        /** The custom field tree a user's `fields` column holds. */
        fields: Field[];
    };
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
    /** Every entry type, the site's and each plugin's, keyed by id. */
    entryTypes: Record<string, AdminEntryType>;
    /** Every global, the site's and each plugin's, keyed by id. */
    globals: Record<string, AdminGlobal>;
    /** Host-defined admin pages, each rendering its own React component. */
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
        /** Anchors permission strings and global keys. */
        permissionNamespace: string;
        /** Sidebar tree derived from nav-visible pages. */
        nav: PluginNavItem[];
        /** Page metadata: unified ResolvedAdminPage (origin-erased). */
        pages: ResolvedAdminPage[];
        /** The plugin's admin resources, each served at `/plugin/<namespace>/resources/<name>`. */
        resources: ResolvedAdminResource[];
    }[];
};

/** One global's admin config, shared by host and plugin globals. */
export type AdminGlobal = {
    /** The namespace of the plugin that declares the global; absent for the site's own. */
    plugin?: string;
    label: Label;
    /** Lucide icon name for the sidebar; absent falls back to a globe icon. */
    icon?: string;
    fields: ResolvedEntryFields;
    capabilities: ResolvedGlobalCapabilities;
    public: boolean;
    nav: boolean;
};

/** Single entry-type admin config, shared by root and plugin entry types. */
export type AdminEntryType = {
    /** The namespace of the plugin that declares the type; absent for the site's own. */
    plugin?: string;
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
};
