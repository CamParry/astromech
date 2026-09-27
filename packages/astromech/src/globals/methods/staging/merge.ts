import type { GlobalResource } from '../../repository';
import { requireStagedChange } from '@/content/staging';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { prepareGlobalFields } from '../../internal/prepare-fields';
import { syncGlobalRelationships } from '../../relationships';
import { globalRepository } from '../../repository';
import { globalSchema, localised } from '../../schema';

/**
 * Checks the staged fields at the canonical row's status, saves the canonical as
 * a version, overwrites its fields and discards the staged change. The status
 * is left alone: publishing is a separate call.
 */
export const mergeStagedGlobal = defineServiceMethod({
    summary: 'Merge the staged change into a global.',
    input: localised,
    output: globalSchema,
    access: globalAccess('publish'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<GlobalResource> {
        const { key } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;

        const { global, id, locale, current } = await getCanonicalGlobal(config, params);
        const staged = await requireStagedChange(globalRepository.staging, 'global', {
            rowId: id,
            id: key,
            locale,
        });

        const fields = await prepareGlobalFields({
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
            if (global.capabilities.versioning) {
                await snapshotVersion('global', globalRepository.versions, current, user);
            }
            const updated = await globalRepository.update(
                { id, locale },
                { fields, updatedBy: userId }
            );
            // Deleted before the re-index, so references only the staged change
            // held are dropped.
            await globalRepository.staging.delete({ id, locale });
            await syncGlobalRelationships(config, id);
            return updated;
        });
    },
});
