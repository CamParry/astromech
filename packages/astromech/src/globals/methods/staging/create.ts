import type { GlobalResource } from '../../repository';
import { transaction } from '@/database/transaction';
import { StagedChangeExistsError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { globalRepository } from '../../repository';
import { globalSchema, localised } from '../../schema';

/**
 * Copies one locale's fields into an unpublished staged change, which
 * `update({ staged: true })` edits and `mergeStaged` makes live. Throws when the
 * locale has no row, or already has a staged change.
 */
export const createStagedGlobal = defineServiceMethod({
    summary: 'Stage a change to a global.',
    input: localised,
    output: globalSchema,
    access: globalAccess('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<GlobalResource> {
        const { key } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;

        const { id, locale, current } = await getCanonicalGlobal(config, params);
        const existing = await globalRepository.staging.findOne({ id, locale });
        if (existing) throw new StagedChangeExistsError('global', { id: key, locale });

        return transaction(async () => {
            const created = await globalRepository.staging.create(
                { id, locale },
                {
                    fields: current.fields,
                    status: 'unpublished',
                    publishedAt: null,
                    createdBy: userId,
                    updatedBy: userId,
                }
            );
            await syncGlobalRelationships(config, id);
            return created;
        });
    },
});
