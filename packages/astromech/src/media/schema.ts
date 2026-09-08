import type { MediaQueryParams } from '@/types/index';
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
 * The `where` filter, declared as what it describes rather than inferred. Its
 * `mimeType` key widens to `| undefined`, which `exactOptionalPropertyTypes`
 * keeps distinct from `MediaQueryParams`' `mimeType?: MediaMimeTypeFilter`.
 * `ParsedInput` reconciles that at the top level of an argument object; it does
 * not reach inside one.
 */
const where = z.object({
    mimeType: z.enum(['images', 'videos', 'documents', 'other']).optional(),
}) as unknown as z.ZodType<NonNullable<MediaQueryParams['where']>>;

/**
 * Call schema for `media.query` — mirrors `MediaQueryParams`. Not a request body:
 * the HTTP route reads these off the query string, so this exists purely so the
 * method manifest can describe how the method is called.
 */
export const mediaQuerySchema = z.object({
    locale: z.string().optional(),
    search: z.string().optional(),
    where: where.optional(),
    page: z.number().optional(),
    limit: z.union([z.number(), z.literal('all')]).optional(),
    // A sort that does not parse is DROPPED rather than rejected, answering the
    // default order — the rule `entrySortSchema` already states.
    sort: z
        .union([
            z.record(z.string(), sortDirection),
            z.array(z.record(z.string(), sortDirection)),
        ])
        .optional()
        .catch(undefined),
});
