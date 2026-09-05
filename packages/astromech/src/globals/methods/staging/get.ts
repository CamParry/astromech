import type { Global } from '@/types/index';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { asGlobal, requireCanonical } from '../../internal/global';
import { localised } from '../../schema';

/**
 * Returns the staged copy of one locale of a global, or null when there is none.
 * Throws when the global has no row in that locale.
 */
export const getStagedGlobal = defineServiceMethod({
    summary: 'Get the staged change of a global.',
    input: localised,
    access: gate('read'),
    requires: 'staging',
    mutates: false,
    async handler(params: { key: string; locale?: string }, ctx): Promise<Global | null> {
        const { repository, id, locale } = await requireCanonical(ctx.config, {
            ...params,
            capability: 'staging',
        });
        const staged = await repository.staging.getByCanonical(id, locale);
        return staged ? asGlobal(staged) : null;
    },
});
