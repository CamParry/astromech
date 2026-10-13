import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../../internal/access';
import { findCanonicalGlobal } from '../../internal/canonical-global';
import { globalRepository } from '../../repository';
import { localised } from '../../schema';

/**
 * Newest first, as metadata; `getVersion` reads one's fields. A locale nothing
 * has saved answers an empty list, as `get` answers null for it, with no
 * fallback to the default locale. An undeclared key throws.
 */
export const listGlobalVersions = defineServiceMethod({
    summary: 'List the saved versions of one locale of a global.',
    input: localised,
    output: z.array(versionMetadataSchema),
    access: globalAccess('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params, ctx): Promise<VersionMetadata[]> {
        const { config } = ctx;

        const canonical = await findCanonicalGlobal(config, params);
        if (!canonical) return [];

        return listVersions(globalRepository.versions, canonical.current);
    },
});
