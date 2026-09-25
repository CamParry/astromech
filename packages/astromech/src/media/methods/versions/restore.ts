import type { Media } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncMediaRelationships } from '../../internal/relationships';
import { toMedia } from '../../internal/to-media';
import { mediaRepository } from '../../repository';

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
    async handler(params, ctx): Promise<Media> {
        const { id } = params;
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            undefined,
            params.locale
        );
        const current = await mediaRepository.findOne(id, { locale });
        if (!current) throw new ResourceNotFoundError('media', { id, locale });

        return restoreVersion({
            spec: RESOURCE_SPECS.media,
            versions: mediaRepository.versions,
            current,
            versionId: params.versionId,
            address: { id, locale },
            user: ctx.user,
            write: async ({ fields, columns }) => {
                const row = await mediaRepository.update(
                    { id, locale },
                    { ...columns, fields }
                );
                await syncMediaRelationships(ctx.config, id);
                return toMedia(ctx.config, row);
            },
        });
    },
});
