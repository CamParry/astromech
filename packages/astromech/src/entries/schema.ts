import { z } from '@hono/zod-openapi';
import { fallback } from '@/services/fallback';
import { jsonObject, unparsedJsonObject } from '@/services/json';

/** The three publication states an entry or global row may carry. */
export const statusSchema = z.enum(['unpublished', 'published', 'scheduled']);

const slugField = z
    .string()
    .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must be lowercase alphanumeric with hyphens'
    )
    .optional();

/** A `Date`, or an offset ISO string coerced to one — nullable and optional. */
export const optionalDate = z
    .union([
        z.date(),
        z
            .string()
            .datetime({ offset: true })
            .transform((v) => new Date(v)),
    ])
    .nullable()
    .optional();

/**
 * The create payload a titleless type takes, and the shape `EntryCreateData`
 * is read off. Every key is optional here; a titled type narrows `title` on
 * top of it, which is the one difference between the two.
 */
export const createEntryPayloadSchema = z.object({
    title: z.string().optional(),
    slug: slugField,
    locale: z.string().min(1).optional(),
    fields: jsonObject.optional(),
    status: statusSchema.optional(),
    publishedAt: optionalDate,
});

const titledCreateEntryPayloadSchema = z.object({
    ...createEntryPayloadSchema.shape,
    title: z.string().min(1, 'Title is required'),
});

/**
 * Per-type create schema. A titled type requires a title; a titleless one takes
 * it as optional, and `create` normalizes a missing title to `''` downstream.
 */
export function createEntrySchema({ titled }: { titled: boolean }) {
    const schema = titled ? titledCreateEntryPayloadSchema : createEntryPayloadSchema;
    return schema.openapi('CreateEntry');
}

/**
 * The update payload a titleless type takes, and the shape `EntryUpdateData`
 * is read off. A titled type narrows `title` on top of it.
 */
export const updateEntryPayloadSchema = z.object({
    title: z.string().optional(),
    slug: slugField,
    fields: jsonObject.optional(),
    status: statusSchema.optional(),
    publishedAt: optionalDate,
});

const titledUpdateEntryPayloadSchema = z.object({
    ...updateEntryPayloadSchema.shape,
    title: z.string().min(1, 'Title cannot be empty').optional(),
});

/**
 * Per-type update schema. Title is always optional; a titled type additionally
 * refuses an empty one ("Title cannot be empty").
 */
export function updateEntrySchema({ titled }: { titled: boolean }) {
    const schema = titled ? titledUpdateEntryPayloadSchema : updateEntryPayloadSchema;
    return schema.openapi('UpdateEntry');
}

export const scheduleEntrySchema = z.object({
    publishedAt: z.union([
        z.date(),
        z
            .string()
            .datetime({ offset: true })
            .transform((v) => new Date(v)),
    ]),
});

/**
 * Overrides accepted by `duplicate`; `locale` copies that locale alone. Authored here rather than inline in a route:
 * the method contract publishes the same payload to MCP and the AI tool-loop, and
 * two copies of a schema is how the two end up describing different things.
 */
export const duplicateOverridesSchema = z
    .object({
        title: z.string().min(1).optional(),
        slug: slugField,
        locale: z.string().min(1).optional(),
        fields: jsonObject.optional(),
        status: statusSchema.optional(),
    })
    .partial();

/**
 * `expiresAt` for a preview token. Coerces an ISO string like every other date
 * entries accepts, so a JSON caller (MCP, the AI tool-loop) does not write a
 * string into a date column.
 */
export const previewTokenSchema = z.object({ expiresAt: optionalDate });

/**
 * One locale of an entry of any type, as every read answers it: the public
 * `Entry`. `fields` is not walked, and a nullable value that fails falls back
 * to null; see `DECISIONS.md` for the three tiers.
 */
export const entrySchema = z
    .object({
        id: z.string(),
        type: z.string(),
        locale: z.string(),
        /** Every locale this entry has a content row for, this one included. Sorted. */
        locales: z.array(z.string()),
        slug: z.string().nullable().catch(fallback(null)),
        title: z.string(),
        fields: unparsedJsonObject,
        status: statusSchema,
        /** True when this read is the staged change rather than the canonical row. */
        staged: z.boolean(),
        /**
         * The publication gate, not a record of when publication happened. While
         * `status` is `'scheduled'` this holds a time ahead of now, and
         * `content/visibility.ts` compares it against the clock: an entry whose
         * `publishedAt` is in the future is not publicly visible. Null means no gate
         * is set. `status` is what tells you which side of now the value is on.
         */
        publishedAt: z.date().nullable().catch(fallback(null)),
        deletedAt: z.date().nullable().catch(fallback(null)),
        /** When the entry was created; every locale of it reports the same value. */
        createdAt: z.date(),
        /**
         * The entry's last change, in any locale; every locale reports the same
         * value. A staged read reports the staged change's own last edit instead,
         * and a staged edit never moves the entry's.
         */
        updatedAt: z.date(),
        /**
         * Who made this locale. Null for a write with no request identity: a seed
         * script, the CLI, the scheduler.
         */
        createdBy: z.string().nullable().catch(fallback(null)),
        /** Who made the entry's last change (on a staged read, the staged change's). */
        updatedBy: z.string().nullable().catch(fallback(null)),
    })
    .openapi('Entry');

/**
 * A staged read: the staged change as an `Entry`, and whether the canonical was
 * written after the staged change was made from it.
 */
export const stagedEntrySchema = entrySchema.extend({ diverged: z.boolean() });

/** A saved snapshot of one locale of one entry. */
export const entryVersionSchema = z
    .object({
        id: z.string(),
        entryId: z.string(),
        locale: z.string(),
        /** Position in the sequence, which runs per entry and locale from 1. */
        version: z.number(),
        title: z.string(),
        slug: z.string().nullable().catch(fallback(null)),
        fields: unparsedJsonObject.nullable(),
        status: statusSchema.nullable().catch(fallback(null)),
        createdAt: z.date(),
        createdBy: z.string().nullable().catch(fallback(null)),
    })
    .openapi('EntryVersion');
