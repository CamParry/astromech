import type { Global, JsonObject } from '@/types/index';
import { transaction } from '@/database/transaction';
import { StagedChangeExistsError } from '@/errors/resource';
import { mergePatch } from '@/fields/values';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal, toGlobal } from '../../internal/global';
import { syncGlobalRelationships } from '../../internal/relationships';
import { createStagedGlobalSchema } from '../../schema';

/**
 * Creates a staged copy of one locale of a global so edits can be drafted off
 * the live row, with `data.fields` patched over the copy. A global with no row
 * in this locale cannot be staged — there is nothing to stage off — and a locale
 * that already has a staged change throws rather than silently replacing it.
 */
export const createStagedGlobal = defineServiceMethod({
    summary: 'Stage a change to a global.',
    input: createStagedGlobalSchema,
    access: gate('update'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<Global> {
        const { repository, id, locale, current } = await getCanonicalGlobal(ctx.config, {
            key: params.key,
            locale: params.locale,
        });

        const existing = await repository.staging.getByCanonical(id, locale);
        if (existing)
            throw new StagedChangeExistsError('global', { id: params.key, locale });

        const user = ctx.user;
        // The staged row copies the canonical's content and is always
        // unpublished: it becomes live by being merged, not by carrying a status
        // of its own.
        // The row and its index write are one transaction.
        const row = await transaction(async () => {
            const staged = await repository.staging.create(
                { id, locale },
                {
                    fields: (params.data?.fields !== undefined
                        ? mergePatch(current.fields, params.data.fields)
                        : current.fields) as JsonObject,
                    status: 'unpublished',
                    publishedAt: null,
                    createdBy: user?.id ?? null,
                    updatedBy: user?.id ?? null,
                }
            );
            await syncGlobalRelationships(ctx.config, id);
            return staged;
        });
        return toGlobal(row);
    },
});
