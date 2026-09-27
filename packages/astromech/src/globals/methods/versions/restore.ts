import type { GlobalResource } from '../../repository';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { syncGlobalRelationships } from '../../relationships';
import { globalRepository } from '../../repository';
import { globalSchema, versionAddress } from '../../schema';

/**
 * Saves the fields it overwrites as a new version first, so a restore can be
 * undone. A locale with no content row, or no version with that number, throws.
 */
export const restoreGlobalVersion = defineServiceMethod({
    summary: 'Restore one locale of a global to a saved version.',
    input: versionAddress,
    output: globalSchema,
    access: globalAccess('update'),
    requires: 'versioning',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<GlobalResource> {
        const { key, version } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;

        const { id, locale, current } = await getCanonicalGlobal(config, params);

        return restoreVersion({
            resource: 'global',
            versions: globalRepository.versions,
            current,
            version,
            address: { id: key },
            user,
            write: async ({ fields }) => {
                const restored = await globalRepository.update(
                    { id, locale },
                    { fields, updatedBy: userId }
                );
                await syncGlobalRelationships(config, id);
                return restored;
            },
        });
    },
});
