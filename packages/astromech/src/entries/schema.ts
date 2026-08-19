import { z } from '@hono/zod-openapi';

// ============================================================================
// Zod schemas
// ============================================================================

export const entryStatusEnum = z.enum(['unpublished', 'published', 'scheduled']);

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
 * Per-type create schema. A titled type requires a title; a titleless one takes
 * it as optional, and `create` normalizes a missing title to `''` downstream.
 */
export function createEntrySchema({ titled }: { titled: boolean }) {
    const title = titled
        ? z.string().min(1, 'Title is required').openapi({ example: 'My Post' })
        : z.string().optional().openapi({ example: 'My Post' });
    return z
        .object({
            title,
            slug: slugField,
            locale: z.string().min(1).optional().openapi({ example: 'en' }),
            localeGroup: z.string().min(1).optional(),
            fields: z
                .record(z.string(), z.unknown())
                .optional()
                .openapi({ example: { body: 'Hello world' } }),
            status: entryStatusEnum.optional(),
            publishedAt: optionalDate,
        })
        .openapi('CreateEntry');
}

/**
 * Per-type update schema. Title is always optional; a titled type additionally
 * refuses an empty one ("Title cannot be empty").
 */
export function updateEntrySchema({ titled }: { titled: boolean }) {
    const title = titled
        ? z.string().min(1, 'Title cannot be empty').optional()
        : z.string().optional();
    return z
        .object({
            title,
            slug: slugField,
            fields: z.record(z.string(), z.unknown()).optional(),
            status: entryStatusEnum.optional(),
            publishedAt: optionalDate,
        })
        .openapi('UpdateEntry');
}

/** Titled-type update schema, for the bulk paths that address no single type. */
export const titledUpdateEntrySchema = updateEntrySchema({ titled: true });

const sortDirection = z.enum(['asc', 'desc']);

const sortObject = z.record(z.string(), sortDirection);

/**
 * A query's `sort` — one field→direction map, or a list of them.
 *
 * A value that does not parse as this shape is DROPPED rather than rejected,
 * answering the default order. A well-shaped sort naming a field the store
 * cannot order by throws: `entries/repository/built-in.ts` holds the allowlist.
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
        example: { title: 'asc' },
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
 * Overrides accepted by `duplicate`. Authored here, in the domain, rather than
 * inline in the route that first needed it: the method contract publishes the
 * same payload to MCP and the AI tool-loop, and two copies of a schema is how
 * the transport and the manifest end up describing different things.
 */
export const duplicateOverridesSchema = z
    .object({
        title: z.string().min(1).optional(),
        slug: slugField,
        locale: z.string().min(1).optional(),
        localeGroup: z.string().min(1).optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        status: entryStatusEnum.optional(),
    })
    .partial();

/**
 * `expiresAt` for a preview token. Coerces an ISO string like every other date
 * the domain accepts, so a JSON caller (MCP, the AI tool-loop) does not write a
 * string into a date column.
 */
export const previewTokenSchema = z.object({ expiresAt: optionalDate });
