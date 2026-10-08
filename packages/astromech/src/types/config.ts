/**
 * Configuration types: entry type config and the Astromech config. Each driver
 * contract and the admin resource contract live with the module that owns them.
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
import type { SchedulerDriver } from '@/cron/driver';
import type { DatabaseDriver } from '@/database/driver';
import type { EmailDriver } from '@/email/driver';
import type { ImageConfig } from '@/media/serving/image/driver';
import type { ResolvedAdminResource } from '@/plugins/admin-resource';
import type { CaptchaConfig, CaptchaWidget } from '@/security/captcha/types';
import type { StorageDriver } from '@/storage/driver';

/** How the admin's entries table displays a column's value. */
export type CellKind =
    | 'text'
    | 'title'
    | 'badge'
    | 'status'
    | 'slug'
    | 'date'
    | 'boolean'
    | 'number'
    | 'relationship'
    | 'locale'
    | 'translations'
    | 'author';

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
    /**
     * Whether entries have a slug, generated from the title and editable in the
     * admin. Default true.
     */
    slug?: boolean;
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
        /** Send `Strict-Transport-Security` on API and admin responses. Off by default; `true` is one year. */
        hsts?: boolean | HstsConfig;
        /** The captcha sign-in, the reset request and `@astromech/forms` check. The secret is `ASTROMECH_CAPTCHA_SECRET`. */
        captcha?: CaptchaConfig;
    };
};

/** `max-age` in seconds (default 31536000), and the two optional flags. */
export type HstsConfig = {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
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
        /** The custom field tree a media item's `fields` column holds. */
        fields: Field[];
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
    /** The captcha widget the sign-in and reset forms render, or null when none is set. Never the secret. */
    captcha: CaptchaWidget | null;
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
    adminColumns: AdminColumn[];
    fields: ResolvedEntryFields;
    views?: ('list' | 'grid')[];
    defaultView?: 'list' | 'grid';
    gridFields?: { field: string; label?: string }[];
    url: string | null;
    capabilities: ResolvedEntryCapabilities;
    titleField: 'title' | false;
};
