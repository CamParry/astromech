import type { JsonObject, MediaVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { MediaNotFoundError } from '../../errors';
import { mediaRepository, resolveMediaLocale } from '../../internal/locale';

/**
 * Lists the saved versions of one locale of a media item, newest first. Unlike a
 * read, this addresses a content row: a locale with none throws rather than
 * falling back to the default.
 */
export const listMediaVersions = defineServiceMethod({
    summary: 'List the saved versions of one locale of a media item.',
    input: z.object({ id: z.string(), locale: z.string().optional() }),
    access: 'media:read',
    mutates: false,
    async handler(params: { id: string; locale?: string }): Promise<MediaVersion[]> {
        const locale = resolveMediaLocale(params.locale);
        const repository = mediaRepository();
        const current = await repository.getExact(params.id, locale);
        if (!current) throw new MediaNotFoundError({ id: params.id, locale });

        const rows = await repository.versions.list(current.contentId);
        return rows.map((row) => ({
            id: row.id,
            // A version row names the content row it snapshots, so the item and
            // locale come from the record it was read for.
            mediaId: params.id,
            locale: current.locale,
            version: row.version,
            title: row.title,
            alt: row.alt,
            caption: row.caption,
            fields: (row.fields ?? null) as JsonObject | null,
            createdAt: row.createdAt,
            createdBy: row.createdBy,
        }));
    },
});
