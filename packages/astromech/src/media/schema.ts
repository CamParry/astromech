import { z } from '@hono/zod-openapi';
import { sortSchema } from '@/content/list';
import { jsonObject } from '@/services/json';
import { MEDIA_MIME_TYPE_FILTERS } from '@/types/query';

export const updateMediaSchema = z
    .object({
        alt: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        caption: z.string().nullable().optional(),
        fields: jsonObject.optional(),
    })
    .openapi('UpdateMedia');

/** The `where` filter a media query accepts: one mime-type class. */
const where = z.object({
    mimeType: z.enum(MEDIA_MIME_TYPE_FILTERS).optional(),
});

/**
 * Call schema for `media.query`, the shape of `MediaQueryParams`. Not a request body:
 * the HTTP route reads these off the query string, so this exists purely so the
 * method manifest can describe how the method is called.
 */
export const mediaQuerySchema = z.object({
    locale: z.string().optional(),
    search: z.string().optional(),
    where: where.optional(),
    page: z.number().optional(),
    limit: z.union([z.number(), z.literal('all')]).optional(),
    sort: sortSchema,
});
