import type { Global } from '@/types/index';
import { hasDiverged } from '@/content/staging';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal, toGlobal } from '../../internal/global';
import { localised } from '../../schema';

/**
 * Returns the staged copy of one locale of a global, or null when there is none,
 * with `diverged` set when the canonical was written after the copy was made.
 * Throws when the global has no row in that locale.
 */
export const getStagedGlobal = defineServiceMethod({
    summary: 'Get the staged change of a global.',
    input: localised,
    access: gate('read'),
    requires: 'staging',
    mutates: false,
    async handler(params, ctx): Promise<(Global & { diverged: boolean }) | null> {
        const { repository, id, locale, current } = await getCanonicalGlobal(
            ctx.config,
            params
        );
        const staged = await repository.staging.findOne({ id, locale });
        if (!staged) return null;
        return { ...toGlobal(staged), diverged: hasDiverged(current, staged) };
    },
});
