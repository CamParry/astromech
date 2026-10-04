import { z } from '@hono/zod-openapi';
import { auditKeys, versionSchema } from '@/content/schema';
import { withFallback } from '@/services/fallback';
import { jsonObject, unparsedJsonObject } from '@/services/json';

export const updateMediaSchema = z
    .strictObject({
        alt: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        caption: z.string().nullable().optional(),
        fields: jsonObject.optional(),
    })
    .openapi('UpdateMedia');

/** What a file's upload records about it; each key is absent when unknown. */
export const mediaMetadataSchema = z.object({
    blurhash: withFallback(z.string().nullable().optional(), undefined),
    /** The content hash of an optimisable image, which versions its URLs. */
    version: withFallback(z.string().optional(), undefined),
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
        ...auditKeys,
    })
    .openapi('Media');

/**
 * The keys a media version keeps: the title, alt text, caption and fields of
 * one locale. The file and its dimensions are never versioned.
 */
export const mediaSnapshotSchema = mediaSchema
    .pick({ title: true, alt: true, caption: true, fields: true })
    .openapi('MediaSnapshot');

/** One saved version of one locale of a media item, as `getVersion` answers it. */
export const mediaVersionSchema = versionSchema('MediaVersion', mediaSnapshotSchema);
