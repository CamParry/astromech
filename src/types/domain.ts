/**
 * Core domain types — entries, users, media, settings, roles, relationships
 */

// ============================================================================
// Utility Types
// ============================================================================

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

// ============================================================================
// Entries
// ============================================================================

export type EntryStatus = 'draft' | 'published' | 'scheduled';

export type Entry = {
    id: string;
    collection: string;
    locale: string;
    translationOf: string | null;
    slug: string | null;
    title: string;
    fields: JsonObject;
    status: EntryStatus;
    publishedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    // createdBy: string | null;
    // updatedBy: string | null;
};

export type EntryVersion = {
    id: string;
    entryId: string;
    versionNumber: number;
    title: string;
    slug: string | null;
    fields: JsonObject | null;
    relations: Record<string, string | string[]> | null;
    status: EntryStatus | null;
    createdAt: Date;
    createdBy: string | null;
};

// ============================================================================
// Relationships
// ============================================================================

export type ResourceType = 'entry' | 'user' | 'media';

export type Relationship = {
    id: string;
    sourceId: string;
    sourceType: ResourceType;
    name: string;
    targetId: string;
    targetType: ResourceType;
    position: number;
    createdAt: Date;
};

// ============================================================================
// Media
// ============================================================================

export type Media = {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    width?: number | null;
    height?: number | null;
    alt?: string | null;
    fields: JsonObject | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
};

// ============================================================================
// Users & Roles
// ============================================================================

export type Permission =
    | 'entry:create:*'
    | `entry:create:${string}`
    | 'entry:read:*'
    | `entry:read:${string}`
    | 'entry:update:*'
    | `entry:update:${string}`
    | 'entry:delete:*'
    | `entry:delete:${string}`
    | 'entry:publish:*'
    | `entry:publish:${string}`
    | 'media:upload'
    | 'media:delete'
    | 'media:read'
    | 'settings:read'
    | 'settings:update'
    | 'users:read'
    | 'users:create'
    | 'users:update'
    | 'users:delete'
    | 'admin:access'
    | '*'
    | (string & {});

export type Role = {
    slug: string;
    name: string;
    permissions: Permission[];
    isBuiltIn: boolean;
};

export type User = {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    fields: JsonObject | null;
    roleSlug: string;
    createdAt: Date;
    updatedAt: Date;
};

// ============================================================================
// Settings
// ============================================================================

export type Setting = {
    key: string;
    value: JsonValue;
    updatedAt: Date;
    updatedBy: string | null;
};
