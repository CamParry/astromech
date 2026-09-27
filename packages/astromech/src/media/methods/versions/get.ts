import type { MediaVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../../repository';
import { mediaVersionSchema } from '../../schema';

/**
 * Addressed by version number. A locale with no content row, or no version with
 * that number, throws, with no fallback to the default locale.
 */
export const getMediaVersion = defineServiceMethod({
    summary: 'Read one saved version of one locale of a media item.',
    input: z.strictObject({
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    }),
    output: mediaVersionSchema,
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<MediaVersion> {
        const { id, version } = params;
        const { config } = ctx;

        const current = await getResourceInLocale(
            'media',
            config,
            mediaRepository,
            params
        );

        return readVersion({
            resource: 'media',
            versions: mediaRepository.versions,
            record: current,
            version,
            address: { id },
        });
    },
});
