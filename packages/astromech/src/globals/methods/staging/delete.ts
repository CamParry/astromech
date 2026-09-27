import { z } from '@hono/zod-openapi';
import { requireStagedChange } from '@/content/staging';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { localised } from '../../schema';

/**
 * Discards the staged copy of one locale of a global, dropping the index rows
 * only it held. Throws when the global has no row in that locale, or no staged
 * change.
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
        const { repository, id, locale } = await getCanonicalGlobal(config, params);
        await requireStagedChange(repository.staging, 'global', {
            rowId: id,
            id: key,
            locale,
        });
        // The global keeps its other content, so this re-derives rather than deletes.
        await transaction(async () => {
            await repository.staging.delete({ id, locale });
            await syncGlobalRelationships(config, id);
        });
    },
});
