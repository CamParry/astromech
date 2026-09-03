import { z } from '@hono/zod-openapi';

export const updateMediaSchema = z
    .object({
        alt: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        caption: z.string().nullable().optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
    })
    .openapi('UpdateMedia');

const sortDirection = z.enum(['asc', 'desc']);

/**
 * Call schema for `media.query` — mirrors `MediaQueryParams`. Not a request body:
 * the HTTP route reads these off the query string, so this exists purely so the
 * method manifest can describe how the method is called.
 */
export const mediaQuerySchema = z.object({
    locale: z.string().optional(),
    search: z.string().optional(),
    where: z
        .object({
            mimeType: z.enum(['images', 'videos', 'documents', 'other']).optional(),
        })
        .optional(),
    page: z.number().optional(),
    limit: z.union([z.number(), z.literal('all')]).optional(),
    sort: z
        .union([
            z.record(z.string(), sortDirection),
            z.array(z.record(z.string(), sortDirection)),
        ])
        .optional(),
});
