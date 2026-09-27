import type { MediaResource } from '../../repository';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncMediaRelationships } from '../../internal/relationships';
import { getMediaInLocale } from '../../internal/versions';
import { mediaRepository } from '../../repository';
import { mediaSchema } from '../../schema';

/**
 * Restores one locale of a media item to one of its saved versions, by its
 * number, snapshotting the state being overwritten first so a restore is itself
 * reversible. A locale with no content row, or no version with that number,
 * throws.
 */
export const restoreMediaVersion = defineServiceMethod({
    summary: 'Restore one locale of a media item to a saved version.',
    input: z.strictObject({
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    }),
    output: mediaSchema,
    access: 'media:update',
    mutates: true,
    async handler(params, ctx): Promise<MediaResource> {
        const { id } = params;
        const current = await getMediaInLocale(ctx.config, params);
        const { locale } = current;

        return restoreVersion({
            spec: RESOURCE_SPECS.media,
            versions: mediaRepository.versions,
            current,
            version: params.version,
            address: { id },
            user: ctx.user,
            write: async ({ fields, columns }) => {
                const row = await mediaRepository.update(
                    { id, locale },
                    { ...columns, fields, updatedBy: ctx.user?.id ?? null }
                );
                await syncMediaRelationships(ctx.config, id);
                return row;
            },
        });
    },
});
