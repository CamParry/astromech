/**
 * Configuration types — collection config, drivers, Astromech config
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { CellKind } from './definitions.js';
import type { Permission } from './domain.js';
import type { FieldBuilderLike, FieldDefinition, FieldGroup } from './fields.js';
import type { PluginDefinition, PluginNavItem, PluginSettingsSchema } from './plugins.js';
import type { EntryStorage } from '@/core/entry-storage/types.js';

// ============================================================================
// Drivers
// ============================================================================

export type DatabaseDriver = {
    type: string;
    getInstance(): LibSQLDatabase;
};

export type StorageDriver = {
    name: string;
    upload: (file: File, path: string) => Promise<string>;
    delete: (path: string) => Promise<void>;
    getUrl: (path: string) => string;
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
    label?: string;
    sortable?: boolean;
    kind?: CellKind;
};

export type VersioningConfig = {
    maxVersions?: number;
};

export type EntryTypeConfig = {
    /**
     * Field groups for this entry type. Mutually exclusive with `fields`.
     * Provide one or the other — not both.
     */
    fieldGroups?: FieldGroup[];
    /**
     * Flat field list shortcut — resolves to a single default "main" group.
     * Mutually exclusive with `fieldGroups`.
     * Accepts plain FieldDefinition objects or any FieldBuilderLike (field builders).
     */
    fields?: (FieldDefinition | FieldBuilderLike)[];
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
    adminColumns?: AdminColumn[];
    views?: ('list' | 'grid')[];
    defaultView?: 'list' | 'grid';
    gridFields?: { field: string; label?: string }[];
    previewUrl?: string;
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
    fieldGroups: FieldGroup[];
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
    fieldGroups?: FieldGroup[];
};

export type UsersConfig = {
    fieldGroups?: FieldGroup[];
};

export type AstromechConfig = {
    db: DatabaseDriver;
    storage: StorageDriver;
    adminRoute?: string;
    apiRoute?: string;
    entries: Record<string, EntryTypeConfig>;
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

export type ResolvedConfig = Omit<AstromechConfig, 'plugins' | 'db'> & {
    adminRoute: string;
    apiRoute: string;
    entries: Record<string, ResolvedEntryTypeConfig>;
    /**
     * Plugin-contributed entry types, namespaced by plugin name → bare type →
     * resolved config. Always present (empty when no plugins contribute types).
     */
    pluginEntries: Record<string, Record<string, ResolvedEntryTypeConfig>>;
    trash: Required<TrashConfig>;
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
        /** Page metadata: permissions pre-resolved, settings schema inline. */
        pages: {
            /** Splat key, `{name}{path}` — matches the `/plugin/$` route. */
            key: string;
            label: string;
            permission: string | null;
            settings: PluginSettingsSchema | null;
            hasComponent: boolean;
        }[];
    }[];
};

/** Single entry-type admin config, shared by root and plugin entry types. */
export type AdminEntryTypeConfig = {
    single: string;
    plural: string;
    versioning: boolean;
    translatable: boolean;
    slug: SlugConfig | null;
    adminColumns: AdminColumn[];
    fieldGroups: FieldGroup[];
    views?: ('list' | 'grid')[];
    defaultView?: 'list' | 'grid';
    gridFields?: { field: string; label?: string }[];
    previewUrl: string | null;
    capabilities: ResolvedEntryCapabilities;
    titleField: 'title' | false;
    /** Field names a multi-type storage indexes for free-text search. */
    search?: string[];
};
