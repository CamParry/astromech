import type { GlobalResource } from '../repository';
import { discardDraft } from '@/content/drafts';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../internal/access';
import { getCanonicalGlobal } from '../internal/canonical-global';
import { globalDraftRepository } from '../repository';
import { globalSchema, localised } from '../schema';

/**
 * Deletes the locale's draft and answers the global as it is live, which the
 * draft never changed: no hook fires, no version is written and the index
 * stays, since it holds live content only. Strapi 5 names it the same. Throws
 * when the locale has no row or no draft.
 */
export const discardGlobalDraft = defineServiceMethod({
    summary: 'Discard the unpublished changes to a published global.',
    input: localised,
    output: globalSchema,
    access: globalAccess('update'),
    requires: 'statuses',
    mutates: true,
    destructive: true,
    async handler(params, ctx): Promise<GlobalResource> {
        const { current } = await getCanonicalGlobal(ctx.config, params);
        return discardDraft('global', globalDraftRepository, current, { id: params.key });
    },
});
