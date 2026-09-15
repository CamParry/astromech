import { z } from '@hono/zod-openapi';
import { jsonObject } from '@/services/json';

/** The three publication states an entry row may carry. */
const entryStatusEnum = z.enum(['unpublished', 'published', 'scheduled']);

const slugField = z
    .string()
    .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must be lowercase alphanumeric with hyphens'
    )
    .optional();

/** A `Date`, or an offset ISO string coerced to one — nullable and optional. */
const optionalDate = z
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
    status: entryStatusEnum.optional(),
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
    status: entryStatusEnum.optional(),
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

/** Titled-type update schema, for the bulk paths that address no single type. */
export const titledUpdateEntrySchema = updateEntrySchema({ titled: true });

const sortDirection = z.enum(['asc', 'desc']);

const sortObject = z.record(z.string(), sortDirection);

/**
 * A query's `sort` — one field→direction map, or a list of them. A value that
 * does not parse as this shape is DROPPED rather than rejected, answering the
 * default order; a well-shaped sort naming an unorderable field throws.
 */
export const entrySortSchema = z
    .union([sortObject, z.array(sortObject)])
    .optional()
    .catch(undefined)
    // `catch` is the one wrapper `@asteasolutions/zod-to-openapi` cannot render,
    // so the OpenAPI shape is stated here. The method manifest still reads the
    // union off the schema itself.
    .openapi({
        type: 'object',
        additionalProperties: { type: 'string', enum: ['asc', 'desc'] },
        description: 'Field → direction, or a list of such objects.',
    });

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
        status: entryStatusEnum.optional(),
    })
    .partial();

/**
 * `expiresAt` for a preview token. Coerces an ISO string like every other date
 * entries accepts, so a JSON caller (MCP, the AI tool-loop) does not write a
 * string into a date column.
 */
export const previewTokenSchema = z.object({ expiresAt: optionalDate });
