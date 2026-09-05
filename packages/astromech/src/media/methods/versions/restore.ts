import type { JsonObject, Media } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { MediaNotFoundError } from '../../errors';
import { mediaRepository, resolveMediaLocale } from '../../internal/locale';
import { indexMediaRelationships } from '../../internal/relationships';
import { toMedia } from '../../internal/to-media';

/**
 * Restores one locale of a media item to one of its saved versions, snapshotting
 * the state being overwritten first so a restore is itself reversible. A version
 * belonging to another locale is not found, not a different row to write.
 */
export const restoreMediaVersion = defineServiceMethod({
    summary: 'Restore one locale of a media item to a saved version.',
    input: z.object({
        id: z.string(),
        locale: z.string().optional(),
        versionId: z.string(),
    }),
    access: 'media:update',
    mutates: true,
    async handler(
        params: {
            id: string;
            locale?: string;
            versionId: string;
        },
        ctx
    ): Promise<Media> {
        const { id } = params;
        const locale = resolveMediaLocale(ctx.config, params.locale);
        const repository = mediaRepository(ctx.config);
        const current = await repository.getExact(id, locale);
        if (!current) throw new MediaNotFoundError({ id, locale });

        const version = await repository.versions.get(params.versionId);
        if (!version || version.contentId !== current.contentId) {
            throw new MediaNotFoundError({ id, locale });
        }
        const fields = ((version.fields as JsonObject | null) ??
            current.fields) as JsonObject;

        const updated = await transaction(async () => {
            await snapshotVersion(repository.versions, current, ctx.user, {
                title: current.title,
                alt: current.alt,
                caption: current.caption,
            });
            const row = await repository.update(
                { id, locale },
                {
                    title: version.title,
                    alt: version.alt,
                    caption: version.caption,
                    fields,
                }
            );
            await indexMediaRelationships(ctx.config, id);
            return row;
        });

        return toMedia(ctx.config, updated);
    },
});
