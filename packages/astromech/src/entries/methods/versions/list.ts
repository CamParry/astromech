import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { entryRepository } from '../../repository/entries-table';

/**
 * Lists the saved versions of one locale of an entry, newest first, as their
 * metadata; `getVersion` reads one's content. Throws if the entry does not
 * exist, has no row in that locale, or is the wrong type.
 */
export const listEntryVersions = defineServiceMethod({
    summary: 'List the version history of an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: z.array(versionMetadataSchema),
    access: entryGate('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params): Promise<VersionMetadata[]> {
        const entry = await getEntryOfType(params.type, params.id, params.locale);
        return listVersions(entryRepository.versions, entry);
    },
});
