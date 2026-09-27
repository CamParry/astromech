import type { GlobalVersion } from '@/types/index';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { globalRepository } from '../../repository';
import { globalVersionSchema, versionAddress } from '../../schema';

/**
 * Addressed by version number. A locale with no content row, or no version with
 * that number, throws, with no fallback to the default locale.
 */
export const getGlobalVersion = defineServiceMethod({
    summary: 'Read one saved version of one locale of a global.',
    input: versionAddress,
    output: globalVersionSchema,
    access: globalAccess('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params, ctx): Promise<GlobalVersion> {
        const { key, version } = params;
        const { config } = ctx;

        const { current } = await getCanonicalGlobal(config, params);

        return readVersion({
            resource: 'global',
            versions: globalRepository.versions,
            record: current,
            version,
            address: { id: key },
        });
    },
});
