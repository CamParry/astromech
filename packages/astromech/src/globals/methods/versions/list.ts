import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { getCanonicalGlobal } from '../../internal/canonical-global';
import { localised } from '../../schema';

/**
 * Lists the saved versions of one locale of a global, newest first, as their
 * metadata; `getVersion` reads one's content. Throws when the global does not
 * keep versions, or has no row in that locale.
 */
export const listGlobalVersions = defineServiceMethod({
    summary: 'List the version history of a global.',
    input: localised,
    output: z.array(versionMetadataSchema),
    access: globalAccess('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params, ctx): Promise<VersionMetadata[]> {
        const { config } = ctx;
        const { repository, current } = await getCanonicalGlobal(config, params);
        return listVersions(repository.versions, current);
    },
});
