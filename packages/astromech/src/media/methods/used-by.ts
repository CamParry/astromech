import type { Usage } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { listUsage } from '@/content/usage';
import { defineServiceMethod } from '@/services/define-service-method';
import { MediaNotFoundError } from '../errors';
import { createMediaRepository } from '../repository';

/**
 * Every reference to a media item, from any resource: the "used by" panel. One
 * row per reference, so a source using the file at two paths is two rows.
 */
export const listMediaUsage = defineServiceMethod({
    summary:
        'List the entries, globals, users and media items that reference a media item.',
    input: z.object({ id: z.string() }),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<Usage[]> {
        const { id } = params;
        const row = await createMediaRepository(ctx.config).files.findOne({ id });
        if (!row) throw new MediaNotFoundError({ id });
        return listUsage(ctx.config, { id, kind: 'media' });
    },
});
