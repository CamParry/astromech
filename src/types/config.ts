/**
 * Configuration types — collection config, drivers, Astromech config
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Permission } from './domain.js';
import type { FieldGroup } from './fields.js';
import type { AstromechPlugin } from './plugins.js';

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
};

export type VersioningConfig = {
    maxVersions?: number;
};

export type EntryTypeConfig = {
    fieldGroups: FieldGroup[];
    versioning?: boolean | VersioningConfig;
    translatable?: boolean;
    slug?: SlugConfig;
    single: string;
    plural: string;
    adminColumns?: AdminColumn[];
    views?: ('list' | 'grid')[];
    defaultView?: 'list' | 'grid';
    gridFields?: { field: string; label?: string }[];
    previewUrl?: string;
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
    plugins?: AstromechPlugin[];
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
    entries: Record<string, EntryTypeConfig>;
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
    roles: Array<{ slug: string; name: string }>;
    entries: Record<string, {
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
    }>;
};
