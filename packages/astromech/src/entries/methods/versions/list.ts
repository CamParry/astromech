import type { EntryVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { toEntryVersion } from '../../internal/versions';
import { getEntryRepository } from '../../repository/registry';

/**
 * Lists the saved versions of one locale of an entry. Returns an empty array
 * when the type's repository keeps no version store. Throws if the entry does
 * not exist, has no row in that locale, or is the wrong type.
 */
export const listEntryVersions = defineServiceMethod({
    summary: 'List the version history of an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    access: entryGate('read'),
    requires: 'versioning',
    mutates: false,
    async handler(params, ctx): Promise<EntryVersion[]> {
        const repository = getEntryRepository(params.type);
        const entry = await getEntryOfType(
            ctx.config,
            repository,
            params.type,
            params.id,
            params.locale
        );
        if (!repository.versions) return [];
        const rows = await repository.versions.list(entry.contentId);
        return rows.map((row) => toEntryVersion(row, entry));
    },
});
