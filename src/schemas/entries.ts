import { z } from '@hono/zod-openapi';

export const entryStatusEnum = z.enum(['draft', 'published', 'scheduled']);

const slugField = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional();

const publishAtField = z
    .union([z.date(), z.string().datetime({ offset: true }).transform(v => new Date(v))])
    .nullable()
    .optional();

/**
 * Per-type create schema factory. For titled types (`titleField: 'title'`) the
 * returned schema is byte-identical in behavior to the legacy `createEntrySchema`
 * (same "Title is required" message, same 422s). For titleless types the title
 * is optional — the orchestrator normalizes a missing title to `''` downstream.
 */
export function createEntrySchemaFor(titleField: 'title' | false) {
    const title =
        titleField === false
            ? z.string().optional().openapi({ example: 'My Post' })
            : z.string().min(1, 'Title is required').openapi({ example: 'My Post' });
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
            publishAt: publishAtField,
        })
        .openapi('CreateEntry');
}

/**
 * Per-type update schema factory. For titled types this matches the legacy
 * `updateEntrySchema` ("Title cannot be empty"); titleless types drop the
 * non-empty constraint while keeping title optional.
 */
export function updateEntrySchemaFor(titleField: 'title' | false) {
    const title =
        titleField === false
            ? z.string().optional()
            : z.string().min(1, 'Title cannot be empty').optional();
    return z
        .object({
            title,
            slug: slugField,
            fields: z.record(z.string(), z.unknown()).optional(),
            status: entryStatusEnum.optional(),
            publishAt: publishAtField,
        })
        .openapi('UpdateEntry');
}

/** Titled-type create schema. Kept for OpenAPI registration and bulk paths. */
export const createEntrySchema = createEntrySchemaFor('title');

/** Titled-type update schema. Kept for OpenAPI registration and bulk paths. */
export const updateEntrySchema = updateEntrySchemaFor('title');

export const scheduleEntrySchema = z.object({
    publishAt: z.union([
        z.date(),
        z.string().datetime({ offset: true }).transform(v => new Date(v)),
    ]),
});
