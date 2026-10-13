import type { GlobalResource } from '../../repository';
import { hasDiverged } from '@/content/staging';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { findCanonicalGlobal } from '../../internal/canonical-global';
import { globalRepository } from '../../repository';
import { localised, stagedGlobalSchema } from '../../schema';

/**
 * Null when the locale has no staged change, which includes a locale nothing
 * has saved, as `get` answers null for it. `diverged` is set when the canonical
 * row was written after the staged change was made. An undeclared key throws.
 */
export const getStagedGlobal = defineServiceMethod({
    summary: 'Get the staged change of a global.',
    input: localised,
    output: stagedGlobalSchema.nullable(),
    access: globalAccess('read'),
    requires: 'staging',
    mutates: false,
    async handler(params, ctx): Promise<(GlobalResource & { diverged: boolean }) | null> {
        const { config } = ctx;

        const canonical = await findCanonicalGlobal(config, params);
        if (!canonical) return null;
        const { id, locale, current } = canonical;
        const staged = await globalRepository.staging.findOne({ id, locale });
        if (!staged) return null;

        return { ...staged, diverged: hasDiverged(current, staged) };
    },
});
