import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { requireCanonical } from '../../internal/global';
import { localised } from '../../schema';

/**
 * Discards the staged copy of one locale of a global. Throws when the global has
 * no row in that locale, or no staged change.
 */
export const deleteStagedGlobal = defineServiceMethod({
    summary: 'Discard the staged change of a global.',
    input: localised,
    access: gate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params: { key: string; locale?: string }, ctx): Promise<void> {
        const { repository, id, locale } = await requireCanonical(ctx.config, {
            ...params,
            capability: 'staging',
        });
        const staged = await repository.staging.getByCanonical(id, locale);
        if (!staged) throw new Error(`No staged change for global '${params.key}'`);
        await repository.staging.delete({ id, locale });
    },
});
