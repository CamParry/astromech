import type { Usage } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { usageSchema } from '@/content/schema';
import { listUsage } from '@/content/usage';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../repository';

/**
 * One row per reference, so a source that uses the file at two paths is two
 * rows. A missing item throws.
 */
export const listMediaUsage = defineServiceMethod({
    summary:
        'List the entries, globals, users and media items that reference a media item.',
    input: z.strictObject({ id: z.string() }),
    output: z.array(usageSchema),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<Usage[]> {
        const { id } = params;
        const { config } = ctx;

        const row = await mediaRepository.findFile(id);
        if (!row) throw new ResourceNotFoundError('media', { id });

        return listUsage(config, { id, kind: 'media' });
    },
});
