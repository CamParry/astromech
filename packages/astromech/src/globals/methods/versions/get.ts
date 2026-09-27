import type { globalSnapshotSchema } from '../../schema';
import type { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
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
    access: gate('read'),
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
            spec: RESOURCE_SPECS.global,
            versions: repository.versions,
            record: current,
            version,
            address: { id: key },
        });
    },
});
