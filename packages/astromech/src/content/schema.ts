/**
 * The schemas the content modules share: the status and date inputs an entry
 * and a global write take, the timestamp and author keys a resource carries,
 * the shape of a saved version, and a `usedBy` row.
 */

import { z } from '@hono/zod-openapi';
import { withFallback } from '@/services/fallback';
import { ENTRY_STATUSES, RESOURCE_TYPES } from '@/types/domain';

/** An entry's or a global's publication status, one of `ENTRY_STATUSES`. */
export const statusSchema = z.enum(ENTRY_STATUSES);

/** A `Date`, or an offset ISO string coerced to one. */
const dateInput = z.union([
    z.date(),
    z
        .string()
        .datetime({ offset: true })
        .transform((v) => new Date(v)),
]);

/** A `Date`, or an offset ISO string coerced to one: nullable and optional. */
export const optionalDate = dateInput.nullable().optional();

/** The payload `schedule` takes on an entry and on a global: the publish date. */
export const scheduleSchema = z.strictObject({ publishedAt: dateInput });

/**
 * When an entry, a global or a media item was created and last changed, and by
 * whom. Each resource's output schema spreads these keys into its own.
 */
export const auditKeys = {
    /** When the resource was created; every locale of it reports the same value. */
    createdAt: z.date(),
    /**
     * The resource's last change, in any locale; every locale reports the same
     * value. For media, replacing the file counts as a change. A staged read of
     * an entry or a global reports the staged change's own last edit instead, and
     * a staged edit never moves the resource's.
     */
    updatedAt: z.date(),
    /**
     * Who created it: for an entry or a global, who made this locale; for media,
     * who uploaded the file. Null for a write with no request identity: a seed
     * script, the CLI, the scheduler.
     */
    createdBy: withFallback(z.string().nullable(), null),
    /** Who made the last change (on a staged read, the staged change's author). */
    updatedBy: withFallback(z.string().nullable(), null),
};

/** The publication gate an entry and a global share. */
export const publishedAtKey = {
    /**
     * The publication gate, not a record of when publication happened. While
     * `status` is `'scheduled'` this holds a time ahead of now, and
     * `content/visibility.ts` compares it against the clock: an entry or global
     * whose `publishedAt` is in the future is not publicly visible. Null means no
     * gate is set. `status` is what tells you which side of now the value is on.
     */
    publishedAt: withFallback(z.date().nullable(), null),
};

/**
 * What every saved version carries besides its content: an item of a
 * `versions` list. A version is addressed by the resource's id, the locale and
 * this number; the version row's own id stays internal.
 */
export const versionMetadataSchema = z
    .object({
        /** Position in the sequence, which runs per resource and locale from 1. */
        version: z.number().int(),
        /** The locale whose content the version holds. */
        locale: z.string(),
        /**
         * When the version was saved. A version holds the state a change
         * replaced, so this is when that change was made.
         */
        createdAt: z.date(),
        /**
         * Who made the change that saved this version. Null for a change with no
         * request identity: a seed script, the CLI, the scheduler.
         */
        createdBy: withFallback(z.string().nullable(), null),
    })
    .openapi('VersionMetadata');

/**
 * One saved version as `getVersion` answers it: the metadata, and `snapshot`,
 * the resource's keys a version keeps, as they were. The snapshot is the
 * resource's public schema narrowed to those keys, so it never mixes two points
 * in time with keys a version does not keep.
 */
export function versionSchema<S extends z.ZodObject>(name: string, snapshot: S) {
    return versionMetadataSchema.extend({ snapshot }).openapi(name);
}

/**
 * One reference in the relationships index pointing at a resource: a row of a
 * `usedBy` answer, which the delete check and the media "used by" panel read.
 */
export const usageSchema = z
    .object({
        sourceId: z.string(),
        /** Display name of the source; empty when it could not be loaded. */
        sourceTitle: z.string(),
        /** What holds the reference. */
        sourceKind: z.enum(RESOURCE_TYPES),
        /**
         * An entry source's type (qualified for a plugin type) or a global source's
         * key. Null for user and media sources.
         */
        sourceType: withFallback(z.string().nullable(), null),
        /** Schema path of the field holding the reference (`sections[].gallery`). */
        schemaPath: z.string(),
        /** Instance path, which deep-links to the exact item. Never pattern-matched. */
        instancePath: z.string(),
        /** True when only the source's staged (pending-merge) change holds it. */
        sourceStaged: z.boolean(),
    })
    .openapi('Usage');
