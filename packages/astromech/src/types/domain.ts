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
    type: string;
    locale: string;
    localeGroup: string;
    /**
     * Map of locale code to entry id, including this entry itself.
     * Always populated. For non-translatable collections this is a single-entry map.
     */
    locales: Record<string, string>;
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

export type MediaMetadata = {
    blurhash?: string | null;
    version?: string;
    orientation?: number;
    duration?: number;
    pageCount?: number;
};

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
    metadata?: MediaMetadata | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
};

// ============================================================================
// Users & Roles
// ============================================================================

/**
 * Permission strings follow `resource[:identifier]:action` — action always last.
 * Segment wildcards: `*` matches one segment; trailing `*` matches all remaining segments.
 *
 * Examples: `entry:posts:read`, `entry:*:read`, `entry:*`, `plugin:my-plugin:*`
 */
export type Permission =
    | 'entry:*'
    | `entry:${string}:create`
    | `entry:${string}:read`
    | `entry:${string}:update`
    | `entry:${string}:delete`
    | `entry:${string}:publish`
    | `entry:${string}:*`
    | 'media:read'
    | 'media:upload'
    | 'media:delete'
    | 'settings:read'
    | 'settings:update'
    | 'users:read'
    | 'users:create'
    | 'users:update'
    | 'users:delete'
    | 'admin:access'
    | `plugin:${string}`
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
// Notifications
// ============================================================================

export type Notification = {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    href: string | null;
    readAt: string | null;
    createdAt: string;
};

export type NotifyTarget = { user: string } | { role: string } | { all: true };

export type NotifyInput = {
    target: NotifyTarget;
    type: string;
    title: string;
    message: string;
    href?: string;
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
