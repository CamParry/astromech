import type { GlobalResource } from '../../repository';
import { transaction } from '@/database/transaction';
import { StagedChangeExistsError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { globalSchema, localised } from '../../schema';

/**
 * Creates a staged copy of one locale of a global so edits can be drafted off
 * the live row with `update({ staged: true })`. A locale with no row has nothing
 * to stage off, and one that already has a staged change throws.
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
        const { repository, id, locale, current } = await getCanonicalGlobal(config, {
            key,
            locale: params.locale,
        });

        const existing = await repository.staging.findOne({ id, locale });
        if (existing) throw new StagedChangeExistsError('global', { id: key, locale });

        // The staged row copies the canonical's content and is always
        // unpublished: it becomes live by being merged, not by carrying a status
        // of its own.
        // The row and its index write are one transaction.
        return transaction(async () => {
            const staged = await repository.staging.create(
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
            return staged;
        });
    },
});
