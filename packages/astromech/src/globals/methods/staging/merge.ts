import type { Global } from '@/types/index';
import { RESOURCE_SPECS } from '@/content/resources';
import { requireStagedChange } from '@/content/staging';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal, toGlobal } from '../../internal/global';
import { syncGlobalRelationships } from '../../internal/relationships';
import { toStoredFields } from '../../internal/stored-fields';
import { localised } from '../../schema';

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
    access: gate('publish'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<Global> {
        const { global, repository, id, locale, current } = await getCanonicalGlobal(
            ctx.config,
            params
        );

        const staged = await requireStagedChange(repository.staging, 'global', {
            rowId: id,
            id: params.key,
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
            user: ctx.user,
            config: ctx.config,
        });

        const merged = await transaction(async () => {
            // Snapshot the canonical first, so a partial failure leaves a
            // recoverable version.
            if (global.capabilities.versioning) {
                await snapshotVersion(
                    RESOURCE_SPECS.global,
                    repository.versions,
                    current,
                    ctx.user
                );
            }
            const row = await repository.update(
                { id, locale },
                { fields, updatedBy: ctx.user?.id ?? null }
            );
            // Discard the staged row before re-indexing, so the references it
            // held on its own do not survive the merge.
            await repository.staging.delete({ id, locale });
            await syncGlobalRelationships(ctx.config, id);
            return row;
        });

        return toGlobal(merged);
    },
});
