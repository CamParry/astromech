import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { requireCanonical } from '../../internal/global';
import { syncGlobalRelationships } from '../../internal/relationships';
import { localised } from '../../schema';

/**
 * Discards the staged copy of one locale of a global, dropping the index rows
 * only it held. Throws when the global has no row in that locale, or no staged
 * change.
 */
export const deleteStagedGlobal = defineServiceMethod({
    summary: 'Discard the staged change of a global.',
    input: localised,
    access: gate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<void> {
        const { repository, id, locale } = await requireCanonical(ctx.config, params);
        const staged = await repository.staging.getByCanonical(id, locale);
        if (!staged) throw new Error(`No staged change for global '${params.key}'`);
        // The global keeps its other content, so this re-derives rather than deletes.
        await transaction(async () => {
            await repository.staging.delete({ id, locale });
            await syncGlobalRelationships(ctx.config, id);
        });
    },
});
