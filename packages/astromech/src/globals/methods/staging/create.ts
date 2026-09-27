import type { GlobalResource } from '../../repository';
import type { JsonObject } from '@/types/index';
import { transaction } from '@/database/transaction';
import { StagedChangeExistsError } from '@/errors/resource';
import { mergePatch } from '@/fields/values';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { createStagedGlobalSchema, globalSchema } from '../../schema';

/**
 * Creates a staged copy of one locale of a global so edits can be drafted off
 * the live row, with `data.fields` patched over the copy. A global with no row
 * in this locale cannot be staged — there is nothing to stage off — and a locale
 * that already has a staged change throws rather than silently replacing it.
 */
export const createStagedGlobal = defineServiceMethod({
    summary: 'Stage a change to a global.',
    input: createStagedGlobalSchema,
    output: globalSchema,
    access: gate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<GlobalResource> {
        const { key, data } = params;
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
                    fields: (data?.fields !== undefined
                        ? mergePatch(current.fields, data.fields)
                        : current.fields) as JsonObject,
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
