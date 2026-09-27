import type { entrySnapshotSchema } from '../../schema';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { entryRepository } from '../../repository/entries-table';
import { entryVersionSchema } from '../../schema';

/**
 * Reads one saved version of one locale of an entry, by its number: the
 * metadata and the title, slug and fields it holds. Throws if the entry does
 * not exist, has no row in that locale, is the wrong type, or has no version
 * with that number.
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
    access: entryGate('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params) {
        const entry = await getEntryOfType(params.type, params.id, params.locale);
        return readVersion<z.input<typeof entrySnapshotSchema>>({
            spec: RESOURCE_SPECS.entry,
            versions: entryRepository.versions,
            record: entry,
            version: params.version,
            address: { id: params.id },
        });
    },
});
