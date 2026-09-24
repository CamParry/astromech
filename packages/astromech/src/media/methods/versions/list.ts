import type { JsonObject, MediaVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { getMediaRepository } from '../../repository';

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
    async handler(params, ctx): Promise<MediaVersion[]> {
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            undefined,
            params.locale
        );
        const repository = getMediaRepository();
        const current = await repository.findOne(params.id, { locale });
        if (!current) throw new ResourceNotFoundError('media', { id: params.id, locale });

        const rows = await repository.versions.findMany(current.contentId);
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
