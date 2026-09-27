import type { GlobalResource } from '../../repository';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { globalSchema, versionAddress } from '../../schema';

/**
 * Restores one locale of a global to one of its saved versions, by its number,
 * snapshotting the state being overwritten first so a restore is itself
 * reversible. Throws when that locale has no version with the number.
 */
export const restoreGlobalVersion = defineServiceMethod({
    summary: 'Roll a global back to an earlier version.',
    input: versionAddress,
    output: globalSchema,
    access: gate('update'),
    requires: 'versioning',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<GlobalResource> {
        const { key, version } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const { repository, id, locale, current } = await getCanonicalGlobal(config, {
            key,
            locale: params.locale,
        });
        return restoreVersion({
            spec: RESOURCE_SPECS.global,
            versions: repository.versions,
            current,
            version,
            address: { id: key },
            user,
            write: async ({ fields }) => {
                const row = await repository.update(
                    { id, locale },
                    { fields, updatedBy: userId }
                );
                await syncGlobalRelationships(config, id);
                return row;
            },
        });
    },
});
