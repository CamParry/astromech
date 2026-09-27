import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../../repository';

/**
 * Lists the saved versions of one locale of a media item, newest first, as their
 * metadata; `getVersion` reads one's content. Unlike a read, this addresses a
 * content row: a locale with none throws rather than falling back to the default.
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
            RESOURCE_SPECS.media,
            config,
            mediaRepository,
            params
        );
        return listVersions(mediaRepository.versions, current);
    },
});
