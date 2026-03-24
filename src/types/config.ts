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

// ============================================================================
// Collections
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

export type CollectionConfig = {
    fieldGroups: FieldGroup[];
    versioning?: boolean;
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
    collections: Record<string, CollectionConfig>;
    media?: MediaConfig;
    users?: UsersConfig;
    roles?: Record<string, RoleConfig>;
    plugins?: AstromechPlugin[];
    trash?: TrashConfig;
};

export type ResolvedConfig = Omit<AstromechConfig, 'plugins' | 'db'> & {
    adminRoute: string;
    apiRoute: string;
    collections: Record<string, CollectionConfig>;
    trash: Required<TrashConfig>;
};

// ============================================================================
// Admin Config (virtual module shape exposed to admin SPA)
// ============================================================================

export type AdminConfig = {
    adminRoute: string;
    apiRoute: string;
    collections: Record<string, {
        single: string;
        plural: string;
        versioning: boolean;
        slug: SlugConfig | null;
        adminColumns: AdminColumn[];
        fieldGroups: FieldGroup[];
        views?: ('list' | 'grid')[];
        defaultView?: 'list' | 'grid';
        gridFields?: { field: string; label?: string }[];
        previewUrl: string | null;
    }>;
};
