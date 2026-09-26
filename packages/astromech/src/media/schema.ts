import { z } from '@hono/zod-openapi';
import { sortSchema } from '@/content/list';
import { withFallback } from '@/services/fallback';
import {
    jsonObject,
    nullableUnparsedJsonObject,
    unparsedJsonObject,
} from '@/services/json';
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
    blurhash: withFallback(z.string().nullable().optional(), undefined),
    /** The content hash of an optimisable image, which versions its URLs. */
    version: withFallback(z.string().optional(), undefined),
    orientation: withFallback(z.number().optional(), undefined),
    duration: withFallback(z.number().optional(), undefined),
    pageCount: withFallback(z.number().optional(), undefined),
});

/** An uploaded file (an image, video, document or other stored asset): the public `Media`. */
export const mediaSchema = z
    .object({
        id: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
        url: z.string(),
        width: withFallback(z.number().nullable(), null),
        height: withFallback(z.number().nullable(), null),
        metadata: withFallback(mediaMetadataSchema.nullable(), null),
        /** The locale the content came from. */
        locale: z.string(),
        /** Locales that have a content row, this one included. Sorted. */
        locales: z.array(z.string()),
        title: withFallback(z.string().nullable(), null),
        alt: withFallback(z.string().nullable(), null),
        caption: withFallback(z.string().nullable(), null),
        fields: unparsedJsonObject,
        createdAt: z.date(),
        /** The item's last change: a file replace, or a content edit in any locale. */
        updatedAt: z.date(),
        createdBy: withFallback(z.string().nullable(), null),
        /** Who made the item's last change. */
        updatedBy: withFallback(z.string().nullable(), null),
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
        title: withFallback(z.string().nullable(), null),
        alt: withFallback(z.string().nullable(), null),
        caption: withFallback(z.string().nullable(), null),
        fields: nullableUnparsedJsonObject,
        createdAt: z.date(),
        createdBy: withFallback(z.string().nullable(), null),
    })
    .openapi('MediaVersion');
