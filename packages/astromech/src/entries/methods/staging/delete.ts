import { z } from '@hono/zod-openapi';
import { requireStagedChange } from '@/content/staging';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { syncEntryRelationships } from '../../internal/relationships';
import { entryRepository } from '../../repository/entries-table';

/**
 * Discards the staged copy of one locale of an entry, dropping the index rows
 * only it held. Throws if the entry does not exist, or has no staged change.
 */
export const deleteStagedEntry = defineServiceMethod({
    summary: 'Discard the staged change of an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    access: entryGate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<void> {
        const { type, id } = params;
        const canonical = await getEntryOfType(type, id, params.locale);
        const { staging } = entryRepository;
        await requireStagedChange(staging, 'entry', {
            rowId: id,
            id,
            locale: canonical.locale,
        });
        await staging.delete({ id, locale: canonical.locale });
        // The entry keeps its other content, so this re-derives rather than deletes.
        await syncEntryRelationships(ctx.config, canonical, type);
    },
});
