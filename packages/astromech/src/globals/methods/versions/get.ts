import type { globalSnapshotSchema } from '../../schema';
import type { z } from '@hono/zod-openapi';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { globalVersionSchema, versionAddress } from '../../schema';

/**
 * Reads one saved version of one locale of a global, by its number: the
 * metadata and the fields it holds. Throws when the global does not keep
 * versions, has no row in that locale, or has no version with that number.
 */
export const getGlobalVersion = defineServiceMethod({
    summary: 'Read one version of a global.',
    input: versionAddress,
    output: globalVersionSchema,
    access: globalAccess('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params, ctx) {
        const { key, version } = params;
        const { config } = ctx;
        const { repository, current } = await getCanonicalGlobal(config, {
            key,
            locale: params.locale,
        });
        return readVersion<z.input<typeof globalSnapshotSchema>>({
            resource: 'global',
            versions: repository.versions,
            record: current,
            version,
            address: { id: key },
        });
    },
});
