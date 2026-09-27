import type { mediaSnapshotSchema } from '../../schema';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../../repository';
import { mediaVersionSchema } from '../../schema';

/**
 * Reads one saved version of one locale of a media item, by its number: the
 * metadata and the title, alt text, caption and fields it holds. A locale with no content row, or no version
 * with that number, throws.
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
    async handler(params, ctx) {
        const current = await getResourceInLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            mediaRepository,
            params
        );
        return readVersion<z.input<typeof mediaSnapshotSchema>>({
            spec: RESOURCE_SPECS.media,
            versions: mediaRepository.versions,
            record: current,
            version: params.version,
            address: { id: params.id },
        });
    },
});
