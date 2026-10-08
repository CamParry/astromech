/**
 * Core domain types: entries, globals, users, media, roles, relationships. A
 * resource's public type is inferred from its output schema in its `schema.ts`.
 */

import type { meSchema } from '@/auth/schema';
import type { RESOURCE_TYPES, TARGET_KINDS } from '@/content/resource-types';
import type { versionMetadataSchema } from '@/content/schema';
import type { entrySchema, entryVersionSchema } from '@/entries/schema';
import type { globalSchema, globalVersionSchema } from '@/globals/schema';
import type {
    mediaMetadataSchema,
    mediaSchema,
    mediaVersionSchema,
} from '@/media/schema';
import type { notificationSchema } from '@/notifications/schema';
import type { allowedAddressSchema, blockedAddressSchema } from '@/security/schema';
import type { userSchema, userVersionSchema } from '@/users/schema';
import type { z } from 'zod';

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/** An entry, a global, a user or a media item: one of `RESOURCE_TYPES`. */
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** What a relation can point at: one of `TARGET_KINDS`. */
export type TargetKind = (typeof TARGET_KINDS)[number];

/** The publication states an entry's or a global's content row carries. */
export const ENTRY_STATUSES = ['unpublished', 'published', 'scheduled'] as const;

/** One of {@link ENTRY_STATUSES}. */
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Whether a value is one of {@link ENTRY_STATUSES}. */
export function isEntryStatus(value: unknown): value is EntryStatus {
    return ENTRY_STATUSES.some((status) => status === value);
}

/** One locale of an entry of any type. Documented key by key on `entrySchema`. */
export type Entry = z.output<typeof entrySchema>;

/** One locale of a global. Documented key by key on `globalSchema`. */
export type Global = z.output<typeof globalSchema>;

/**
 * What every saved version carries besides its content: its number, locale,
 * and when and by whom it was saved. An item of a `versions` list, for any
 * resource. Documented key by key on `versionMetadataSchema`.
 */
export type VersionMetadata = z.output<typeof versionMetadataSchema>;

/**
 * One saved version of one locale of an entry: its metadata, and `snapshot`,
 * the title, slug and fields as they were.
 */
export type EntryVersion = z.output<typeof entryVersionSchema>;

/**
 * One saved version of one locale of a global: its metadata, and `snapshot`,
 * the fields as they were.
 */
export type GlobalVersion = z.output<typeof globalVersionSchema>;

/**
 * One saved version of one locale of a media item: its metadata, and
 * `snapshot`, the title, alt text, caption and fields as they were.
 */
export type MediaVersion = z.output<typeof mediaVersionSchema>;

/**
 * One saved version of one locale of a user's fields: its metadata, and
 * `snapshot`, the fields as they were.
 */
export type UserVersion = z.output<typeof userVersionSchema>;

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
    | 'security:manage'
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

/** The signed-in user and their role, as `GET /api/me` answers them under `data`. */
export type Me = z.output<typeof meSchema>;

/** One notification in a user's inbox. */
export type Notification = z.output<typeof notificationSchema>;

/** A client address or range the API and admin refuse requests from. */
export type BlockedAddress = z.output<typeof blockedAddressSchema>;

/** A client address or range no block applies to. */
export type AllowedAddress = z.output<typeof allowedAddressSchema>;

export type NotifyTarget = { user: string } | { role: string } | { all: true };

export type NotifyInput = {
    target: NotifyTarget;
    type: string;
    title: string;
    message: string;
    /** Admin-relative click-through path (e.g. `/entries/123`), without the admin base prefix. */
    href?: string;
};
