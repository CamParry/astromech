import type { GlobalResource } from '../../repository';
import { RESOURCE_SPECS } from '@/content/resources';
import { requireStagedChange } from '@/content/staging';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { toStoredFields } from '../../internal/stored-fields';
import { syncGlobalRelationships } from '../../relationships';
import { globalSchema, localised } from '../../schema';

/**
 * Merges a staged change into the canonical content row it was made from:
 * validates the staged content against the canonical, snapshots the canonical,
 * overwrites it in place, and discards the staged row, all in one transaction.
 * Content-only — the canonical's status is untouched, because publishing is a
 * separate action.
 */
export const mergeStagedGlobal = defineServiceMethod({
    summary: 'Merge the staged change into a global.',
    input: localised,
    output: globalSchema,
    access: gate('publish'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<GlobalResource> {
        const { key } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const { global, repository, id, locale, current } = await getCanonicalGlobal(
            config,
            params
        );

        const staged = await requireStagedChange(repository.staging, 'global', {
            rowId: id,
            id: key,
            locale,
        });

        // Merging is the promotion moment: editing the staged row validates at
        // the draft stage (it is unpublished), so this is the first write where
        // the canonical's own status decides whether completeness is enforced.
        // Run it BEFORE the transaction opens so a rejection costs no backup
        // version.
        const fields = await toStoredFields({
            repository,
            global,
            id,
            locale,
            patch: staged.fields,
            current,
            status: current.status,
            user,
            config,
        });

        return transaction(async () => {
            // Snapshot the canonical first, so a partial failure leaves a
            // recoverable version.
            if (global.capabilities.versioning) {
                await snapshotVersion(
                    RESOURCE_SPECS.global,
                    repository.versions,
                    current,
                    user
                );
            }
            const row = await repository.update(
                { id, locale },
                { fields, updatedBy: userId }
            );
            // Discard the staged row before re-indexing, so the references it
            // held on its own do not survive the merge.
            await repository.staging.delete({ id, locale });
            await syncGlobalRelationships(config, id);
            return row;
        });
    },
});
