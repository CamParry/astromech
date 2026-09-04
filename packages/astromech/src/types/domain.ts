/**
 * Core domain types — entries, globals, users, media, settings, roles,
 * relationships
 */

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * What carries fields and runs the field pipeline — an entry, a global, a user
 * or a media item. `TargetKind` (`fields/relationship-edges.ts`) is the
 * relation-eligible subset.
 */
export type ResourceType = 'entry' | 'global' | 'user' | 'media';

export type EntryStatus = 'unpublished' | 'published' | 'scheduled';

/** A content record — one locale of an entry type's primary object. */
export type Entry = {
    id: string;
    type: string;
    locale: string;
    /** Every locale this entry has a content row for, this one included. Sorted. */
    locales: string[];
    slug: string | null;
    title: string;
    fields: JsonObject;
    status: EntryStatus;
    /** True when this read is the staged change rather than the canonical row. */
    staged: boolean;
    /**
     * The publication gate, not a record of when publication happened. While
     * `status` is `'scheduled'` this holds a time ahead of now, and
     * `content/visibility.ts` compares it against the clock: an entry whose
     * `publishedAt` is in the future is not publicly visible. Null means no gate
     * is set. `status` is what tells you which side of now the value is on.
     */
    publishedAt: Date | null;
    deletedAt: Date | null;
    /** When the entry was created; every locale of it reports the same value. */
    createdAt: Date;
    /** When this locale was last edited. */
    updatedAt: Date;
    /**
     * Who made this locale and who last wrote to it. Null for a write with no
     * request identity (a seed script, the CLI, the scheduler), and absent
     * altogether on a `tableRepository`-backed type, whose table has no such
     * columns.
     */
    createdBy?: string | null;
    updatedBy?: string | null;
};

/**
 * One editor-owned, exactly-one, site-wide piece of content, in one locale. A
 * global is addressed by its config `key` everywhere public; `id` is the row it
 * was saved as, present so a future relation has the same target shape every
 * other resource offers.
 */
export type Global = {
    id: string;
    key: string;
    locale: string;
    /** Locales that have a content row, this one included. Sorted. */
    locales: string[];
    fields: JsonObject;
    status: EntryStatus;
    /** True when this read is the staged change rather than the canonical row. */
    staged: boolean;
    /** The publication gate, read exactly as `Entry.publishedAt` is. */
    publishedAt: Date | null;
    /** When the global was first saved; every locale reports the same value. */
    createdAt: Date;
    /** When this locale was last edited. */
    updatedAt: Date;
    /**
     * Who made this locale and who last wrote to it. Null for a write with no
     * request identity — a seed script, the CLI, the scheduler.
     */
    createdBy?: string | null;
    updatedBy?: string | null;
};

/** A saved snapshot of one locale of one global. */
export type GlobalVersion = {
    id: string;
    key: string;
    locale: string;
    /** Position in the sequence, which runs per global and locale from 1. */
    version: number;
    fields: JsonObject | null;
    status: EntryStatus | null;
    createdAt: Date;
    createdBy: string | null;
};

/** A saved snapshot of one locale of one media item. */
export type MediaVersion = {
    id: string;
    mediaId: string;
    locale: string;
    /** Position in the sequence, which runs per media item and locale from 1. */
    version: number;
    title: string | null;
    alt: string | null;
    caption: string | null;
    fields: JsonObject | null;
    createdAt: Date;
    createdBy: string | null;
};

/** A saved snapshot of one locale of one entry. */
export type EntryVersion = {
    id: string;
    entryId: string;
    locale: string;
    /** Position in the sequence, which runs per entry and locale from 1. */
    version: number;
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
    metadata?: MediaMetadata | null;
    /** The locale the content came from. */
    locale: string;
    /** Locales that have a content row, this one included. Sorted. */
    locales: string[];
    title: string | null;
    alt: string | null;
    caption: string | null;
    fields: JsonObject;
    createdAt: Date;
    /**
     * The file's last change (upload or replace), which the admin uses to bust
     * its image cache.
     */
    updatedAt: Date;
    createdBy: string | null;
    /** Who last replaced the file. */
    updatedBy: string | null;
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
    /** The slug of the user's role, resolved against the config. */
    role: string;
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
