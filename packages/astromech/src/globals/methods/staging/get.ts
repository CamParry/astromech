import type { GlobalResource } from '../../repository';
import { hasDiverged } from '@/content/staging';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/global';
import { localised, stagedGlobalSchema } from '../../schema';

/**
 * Returns the staged copy of one locale of a global, or null when there is none,
 * with `diverged` set when the canonical was written after the copy was made.
 * Throws when the global has no row in that locale.
 */
export const getStagedGlobal = defineServiceMethod({
    summary: 'Get the staged change of a global.',
    input: localised,
    output: stagedGlobalSchema.nullable(),
    access: gate('read'),
    requires: 'staging',
    mutates: false,
    async handler(params, ctx): Promise<(GlobalResource & { diverged: boolean }) | null> {
        const { repository, id, locale, current } = await getCanonicalGlobal(
            ctx.config,
            params
        );
        const staged = await repository.staging.findOne({ id, locale });
        if (!staged) return null;
        return { ...staged, diverged: hasDiverged(current, staged) };
    },
});
