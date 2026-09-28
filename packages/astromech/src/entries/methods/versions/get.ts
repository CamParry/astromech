import type { entrySnapshotSchema } from '../../schema';
import { z } from '@hono/zod-openapi';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
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
    input: getEntryVersionInput({ type: z.string() }),
    output: entryVersionSchema,
    access: entryAccess('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params) {
        const { type, id, version } = params;
        const entry = await getEntryOfType(type, id, params.locale);
        return readVersion<z.input<typeof entrySnapshotSchema>>({
            resource: 'entry',
            versions: entryRepository.versions,
            record: entry,
            version,
            address: { id },
        });
    },
});

/**
 * `entries.getVersion`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function getEntryVersionInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({
        type,
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    });
}
