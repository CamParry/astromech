/**
 * Core domain types: entries, globals, users, media, roles, relationships. A
 * resource's public type is inferred from its output schema in its `schema.ts`.
 */

import type { entrySchema, entryVersionSchema } from '@/entries/schema';
import type { globalSchema, globalVersionSchema } from '@/globals/schema';
import type {
    mediaMetadataSchema,
    mediaSchema,
    mediaVersionSchema,
} from '@/media/schema';
import type { notificationSchema } from '@/notifications/schema';
import type { userSchema, userVersionSchema } from '@/users/schema';
import type { z } from 'zod';

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * Every resource kind: what carries fields and runs the field pipeline. The
 * relationships index's source column and `TargetKind` (`fields/references.ts`),
 * the relation-eligible subset, are built from it.
 */
export const RESOURCE_TYPES = ['entry', 'global', 'user', 'media'] as const;

/** An entry, a global, a user or a media item. */
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * What a relation can point at: every resource but a global, which is addressed
 * by its key and never referenced. The index's `targetKind` column is built from it.
 */
export const TARGET_KINDS = [
    'entry',
    'user',
    'media',
] as const satisfies readonly ResourceType[];

/** One of {@link TARGET_KINDS}. */
export type TargetKind = (typeof TARGET_KINDS)[number];

export type EntryStatus = 'unpublished' | 'published' | 'scheduled';

/** One locale of an entry of any type. Documented key by key on `entrySchema`. */
export type Entry = z.output<typeof entrySchema>;

/** One locale of a global. Documented key by key on `globalSchema`. */
export type Global = z.output<typeof globalSchema>;

/** A saved snapshot of one locale of one global. */
export type GlobalVersion = z.output<typeof globalVersionSchema>;

/** A saved snapshot of one locale of one user's fields. */
export type UserVersion = z.output<typeof userVersionSchema>;

/** A saved snapshot of one locale of one media item. */
export type MediaVersion = z.output<typeof mediaVersionSchema>;

/** A saved snapshot of one locale of one entry. */
export type EntryVersion = z.output<typeof entryVersionSchema>;

// A relationship row has no hand-written type: it is a derived index whose
// shape comes from its `Table`, so `RelationshipRow` in `database/schema.ts`
// is the one definition. A second copy here could only drift out of date.

/** What a file's upload records about it. */
export type MediaMetadata = z.output<typeof mediaMetadataSchema>;

/** An uploaded file: an image, video, document or other stored asset. */
export type Media = z.output<typeof mediaSchema>;

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

/** An admin user account. Documented key by key on `userSchema`. */
export type User = z.output<typeof userSchema>;

/** One notification in a user's inbox. */
export type Notification = z.output<typeof notificationSchema>;

export type NotifyTarget = { user: string } | { role: string } | { all: true };

export type NotifyInput = {
    target: NotifyTarget;
    type: string;
    title: string;
    message: string;
    /** Admin-relative click-through path (e.g. `/entries/123`), without the admin base prefix. */
    href?: string;
};
