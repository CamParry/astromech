import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';

/**
 * Newest first, as metadata; `getVersion` reads one's content. A locale with no
 * row of this type throws, with no fallback to the default locale.
 */
export const listEntryVersions = defineServiceMethod({
    summary: 'List the version history of an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: z.array(versionMetadataSchema),
    access: entryAccess('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params): Promise<VersionMetadata[]> {
        const { type, id } = params;

        const entry = await getEntryOfType(type, id, params.locale);

        return listVersions(entryRepository.versions, entry);
    },
});
