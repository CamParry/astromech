import type { GlobalResource } from '../../repository';
import type { WriteGuard } from '@/content/write-guard';
import { assertGuardHolds, writeGuarded } from '@/content/write-guard';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { globalRepository } from '../../repository';
import { globalSchema, localised } from '../../schema';

/**
 * Copies one locale's fields, as stored when the copy is made, into an
 * unpublished staged change, which `update({ staged: true })` edits and
 * `mergeStaged` makes live. Throws when the locale has no row, or already has a
 * staged change.
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
        const staged = await globalRepository.staging.findOne({ id, locale });
        const guard: WriteGuard = { contentId: current.contentId, stagedAbsent: true };
        assertGuardHolds('global', { canonical: current, staged }, guard, {
            id: key,
            locale,
        });

        return transaction(async () => {
            const created = await writeGuarded({
                kind: 'global',
                address: { id: key, locale },
                guard,
                repository: globalRepository,
                write: () =>
                    globalRepository.staging.create(
                        { id, locale },
                        {
                            status: 'unpublished',
                            publishedAt: null,
                            createdBy: userId,
                            updatedBy: userId,
                        },
                        guard
                    ),
            });
            await syncGlobalRelationships(config, id);
            return created;
        });
    },
});
