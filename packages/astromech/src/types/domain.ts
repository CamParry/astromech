/**
 * Core domain types — entries, users, media, settings, roles, relationships
 */

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * What carries fields and runs the field pipeline — an entry, a user, a media
 * item or a settings page. `TargetKind` (`fields/relationship-edges.ts`) is the
 * relation-eligible subset.
 */
export type ResourceType = 'entry' | 'user' | 'media' | 'setting';

export type EntryStatus = 'unpublished' | 'published' | 'scheduled';

/** A content record — the primary object of an entry type. */
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
    /**
     * When non-null, this entry is a *staged change* of the referenced canonical
     * entry (forward versioning). Null/absent = a normal canonical entry.
     */
    stagedFor?: string | null;
    /**
     * The publication gate, not a record of when publication happened. While
     * `status` is `'scheduled'` this holds a time ahead of now, and
     * `entries/visibility.ts` compares it against the clock: an entry whose
     * `publishedAt` is in the future is not publicly visible. Null means no gate
     * is set. `status` is what tells you which side of now the value is on.
     */
    publishedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    /**
     * Who made this row and who last wrote to it. Null for a write with no
     * request identity (a seed script, the CLI, the scheduler), and absent
     * altogether on a `tableRepository`-backed type, whose table has no such
     * columns — the same reason `type` and `locales` are conditional.
     */
    createdBy?: string | null;
    updatedBy?: string | null;
};

export type EntryVersion = {
    id: string;
    entryId: string;
    versionNumber: number;
    title: string;
    slug: string | null;
    fields: JsonObject | null;
    status: EntryStatus | null;
    createdAt: Date;
    createdBy: string | null;
};

// A relationship row has no hand-written type: it is a derived index whose
// shape comes from its `Table`, so `RelationshipRow` in `database/schema.ts`
// is the one definition. A second copy here could only drift out of date.

export type MediaMetadata = {
    blurhash?: string | null;
    version?: string;
    orientation?: number;
    duration?: number;
    pageCount?: number;
};

/** An uploaded file — an image, video, document or other stored asset. */
export type Media = {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    width?: number | null;
    height?: number | null;
    alt?: string | null;
    title?: string | null;
    caption?: string | null;
    fields: JsonObject | null;
    metadata?: MediaMetadata | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
};

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
    | 'media:update'
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

/** An admin user account. */
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

export type Notification = {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    href: string | null;
    createdAt: string;
};

export type NotifyTarget = { user: string } | { role: string } | { all: true };

export type NotifyInput = {
    target: NotifyTarget;
    type: string;
    title: string;
    message: string;
    /** Admin-relative click-through path (e.g. `/entries/123`), without the admin base prefix. */
    href?: string;
};

export type Setting = {
    key: string;
    value: JsonValue;
    updatedAt: Date;
    updatedBy: string | null;
};
