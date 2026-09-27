import { z } from '@hono/zod-openapi';
import { requireStagedChange } from '@/content/staging';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { globalRepository } from '../../repository';
import { localised } from '../../schema';

/**
 * Drops the index rows only the staged change held. Throws when the locale has no
 * row, or no staged change.
 */
export const deleteStagedGlobal = defineServiceMethod({
    summary: 'Discard the staged change of a global.',
    input: localised,
    output: z.void(),
    access: globalAccess('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<void> {
        const { key } = params;
        const { config } = ctx;

        const { id, locale } = await getCanonicalGlobal(config, params);
        await requireStagedChange(globalRepository.staging, 'global', {
            rowId: id,
            id: key,
            locale,
        });

        // The global keeps its other content, so its index is re-derived, not deleted.
        await transaction(async () => {
            await globalRepository.staging.delete({ id, locale });
            await syncGlobalRelationships(config, id);
        });
    },
});
