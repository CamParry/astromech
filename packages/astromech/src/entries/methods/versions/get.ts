import type { EntryVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';
import { entryVersionSchema } from '../../schema';

/**
 * Addressed by version number. A locale with no row of this type, or no version
 * with that number, throws, with no fallback to the default locale.
 */
export const getEntryVersion = defineServiceMethod({
    summary: 'Read one version of an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    }),
    output: entryVersionSchema,
    access: entryAccess('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params): Promise<EntryVersion> {
        const { type, id, version } = params;

        const entry = await getEntryOfType(type, id, params.locale);

        return readVersion({
            resource: 'entry',
            versions: entryRepository.versions,
            record: entry,
            version,
            address: { id },
        });
    },
});
