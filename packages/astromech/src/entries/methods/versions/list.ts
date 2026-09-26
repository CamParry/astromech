import type { EntryVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { toEntryVersion } from '../../internal/versions';
import { entryRepository } from '../../repository/entries-table';
import { entryVersionSchema } from '../../schema';

/**
 * Lists the saved versions of one locale of an entry. Throws if the entry does
 * not exist, has no row in that locale, or is the wrong type.
 */
export const listEntryVersions = defineServiceMethod({
    summary: 'List the version history of an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: z.array(entryVersionSchema),
    access: entryGate('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params): Promise<EntryVersion[]> {
        const entry = await getEntryOfType(params.type, params.id, params.locale);
        const rows = await entryRepository.versions.findMany(entry.contentId);
        return rows.map((row) => toEntryVersion(row, entry));
    },
});
