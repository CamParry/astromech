import { z } from '@hono/zod-openapi';
import { sortSchema } from '@/content/list';
import { fallback } from '@/services/fallback';
import { jsonObject, unparsedJsonObject } from '@/services/json';
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

/** What a file's upload records about it; each key is absent when unknown. */
export const mediaMetadataSchema = z.object({
    blurhash: z.string().nullable().optional().catch(fallback(undefined)),
    /** The content hash of an optimisable image, which versions its URLs. */
    version: z.string().optional().catch(fallback(undefined)),
    orientation: z.number().optional().catch(fallback(undefined)),
    duration: z.number().optional().catch(fallback(undefined)),
    pageCount: z.number().optional().catch(fallback(undefined)),
});

/** An uploaded file (an image, video, document or other stored asset): the public `Media`. */
export const mediaSchema = z
    .object({
        id: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
        url: z.string(),
        width: z.number().nullable().catch(fallback(null)),
        height: z.number().nullable().catch(fallback(null)),
        metadata: mediaMetadataSchema.nullable().catch(fallback(null)),
        /** The locale the content came from. */
        locale: z.string(),
        /** Locales that have a content row, this one included. Sorted. */
        locales: z.array(z.string()),
        title: z.string().nullable().catch(fallback(null)),
        alt: z.string().nullable().catch(fallback(null)),
        caption: z.string().nullable().catch(fallback(null)),
        fields: unparsedJsonObject,
        createdAt: z.date(),
        /** The item's last change: a file replace, or a content edit in any locale. */
        updatedAt: z.date(),
        createdBy: z.string().nullable().catch(fallback(null)),
        /** Who made the item's last change. */
        updatedBy: z.string().nullable().catch(fallback(null)),
    })
    .openapi('Media');

/** A saved snapshot of one locale of one media item. */
export const mediaVersionSchema = z
    .object({
        id: z.string(),
        mediaId: z.string(),
        locale: z.string(),
        /** Position in the sequence, which runs per media item and locale from 1. */
        version: z.number(),
        title: z.string().nullable().catch(fallback(null)),
        alt: z.string().nullable().catch(fallback(null)),
        caption: z.string().nullable().catch(fallback(null)),
        fields: unparsedJsonObject.nullable(),
        createdAt: z.date(),
        createdBy: z.string().nullable().catch(fallback(null)),
    })
    .openapi('MediaVersion');
