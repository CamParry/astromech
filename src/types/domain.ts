/**
 * Core domain types — entities, users, media, settings, roles, relationships
 */

// ============================================================================
// Utility Types
// ============================================================================

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

// ============================================================================
// Entities
// ============================================================================

export type EntityStatus = 'draft' | 'published' | 'scheduled';

export type Entity = {
    id: string;
    collection: string;
    locale?: string | null;
    slug: string | null;
    title: string;
    fields: JsonObject;
    status: EntityStatus;
    publishedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    // createdBy: string | null;
    // updatedBy: string | null;
};

export type EntityVersion = {
    id: string;
    entityId: string;
    versionNumber: number;
    title: string;
    fields: JsonObject;
    status: EntityStatus;
    createdAt: Date;
    createdBy: string | null;
};

// ============================================================================
// Relationships
// ============================================================================

export type ResourceType = 'entity' | 'user' | 'media';

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
    | 'entity:create:*'
    | `entity:create:${string}`
    | 'entity:read:*'
    | `entity:read:${string}`
    | 'entity:update:*'
    | `entity:update:${string}`
    | 'entity:delete:*'
    | `entity:delete:${string}`
    | 'entity:publish:*'
    | `entity:publish:${string}`
    | 'media:upload'
    | 'media:delete'
    | 'settings:read'
    | 'settings:update'
    | 'users:read'
    | 'users:create'
    | 'users:update'
    | 'users:delete'
    | 'admin:access'
    | '*';

export type Role = {
    slug: string;
    name: string;
    permissions: Permission[];
    isBuiltIn: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type User = {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    fields: JsonObject | null;
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
