import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../../repository';

/**
 * Newest first, as metadata; `getVersion` reads one's content. A locale with no
 * content row throws, with no fallback to the default locale.
 */
export const listMediaVersions = defineServiceMethod({
    summary: 'List the saved versions of one locale of a media item.',
    input: z.strictObject({ id: z.string(), locale: z.string().optional() }),
    output: z.array(versionMetadataSchema),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<VersionMetadata[]> {
        const { config } = ctx;

        const current = await getResourceInLocale(
            'media',
            config,
            mediaRepository,
            params
        );

        return listVersions(mediaRepository.versions, current);
    },
});
