import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';

/**
 * Lists the saved versions of one locale of an entry, newest first, as their
 * metadata; `getVersion` reads one's content. Throws if the entry does not
 * exist, has no row in that locale, or is the wrong type.
 */
export const listEntryVersions = defineServiceMethod({
    summary: 'List the version history of an entry.',
    input: listEntryVersionsInput({ type: z.string() }),
    output: z.array(versionMetadataSchema),
    access: entryGate('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params): Promise<VersionMetadata[]> {
        const { type, id } = params;
        const entry = await getEntryOfType(type, id, params.locale);
        return listVersions(entryRepository.versions, entry);
    },
});

/**
 * `entries.versions`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function listEntryVersionsInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string(), locale: z.string().optional() });
}
