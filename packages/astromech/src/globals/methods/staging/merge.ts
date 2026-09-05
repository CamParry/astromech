import type { Global } from '@/types/index';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { asGlobal, requireCanonical } from '../../internal/global';
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
    async handler(params: { key: string; locale?: string }, ctx): Promise<Global> {
        const { global, repository, id, locale, current } = await requireCanonical({
            ...params,
            capability: 'staging',
        });

        const staged = await repository.staging.getByCanonical(id, locale);
        if (!staged) throw new Error(`No staged change for global '${params.key}'`);

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
            user: ctx.user,
        });

        const merged = await transaction(async () => {
            // Snapshot the canonical first, so a partial failure leaves a
            // recoverable version.
            if (global.capabilities.versioning) {
                await snapshotVersion(repository.versions, current);
            }
            const row = await repository.update({ id, locale }, { fields });
            await repository.staging.delete({ id, locale });
            return row;
        });

        return asGlobal(merged);
    },
});
