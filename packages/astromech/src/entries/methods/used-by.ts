import type { Usage } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { listUsage } from '@/content/usage';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { getEntryResource } from '../internal/read-entry';
import { getEntryRepository } from '../repository/registry';

/**
 * Every reference to an entry, from any resource: what the delete check lists.
 * One row per reference, so a source referencing the entry twice is two rows.
 */
export const listEntryUsage = defineServiceMethod({
    summary: 'List the entries, globals, users and media items that reference an entry.',
    input: z.object({ type: z.string(), id: z.string() }),
    access: entryGate('read'),
    mutates: false,
    async handler(params, ctx): Promise<Usage[]> {
        // The entry must exist as this type, so an unknown id answers 404.
        await getEntryResource(
            ctx.config,
            getEntryRepository(params.type),
            params.type,
            params.id
        );
        return listUsage(ctx.config, { id: params.id, kind: 'entry' });
    },
});
