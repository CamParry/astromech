import { z } from '@hono/zod-openapi';
import { requireStagedChange } from '@/content/staging';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';

/**
 * Drops the index rows only the staged change held. Throws when the locale has no
 * row of this type, or no staged change.
 */
export const deleteStagedEntry = defineServiceMethod({
    summary: 'Discard the staged change of an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: z.void(),
    access: entryAccess('update'),
    requires: 'staging',
    mutates: true,
    destructive: true,
    async handler(params, ctx): Promise<void> {
        const { type, id } = params;
        const { config } = ctx;

        const canonical = await getEntryOfType(type, id, params.locale);
        const { locale } = canonical;
        await requireStagedChange(entryRepository.staging, 'entry', {
            rowId: id,
            id,
            locale,
        });

        // The entry keeps its other content, so its index is re-derived, not deleted.
        await transaction(async () => {
            await entryRepository.staging.delete({ id, locale });
            await syncEntryRelationships(config, canonical);
        });
    },
});
