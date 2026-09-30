import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { hasDiverged } from '@/content/staging';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';
import { stagedEntrySchema } from '../../schema';

/**
 * Null when the locale has no staged change. `diverged` is set when the canonical
 * row was written after the staged change was made. Throws when the locale has
 * no row of this type.
 */
export const getStagedEntry = defineServiceMethod({
    summary: 'Get the staged change of an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: stagedEntrySchema.nullable(),
    access: entryAccess('read'),
    requires: 'staging',
    mutates: false,
    async handler(params): Promise<(EntryResource & { diverged: boolean }) | null> {
        const { type, id } = params;

        const canonical = await getEntryOfType(type, id, params.locale);
        const staged = await entryRepository.staging.findOne({
            id,
            locale: canonical.locale,
        });
        if (!staged) return null;

        return { ...staged, diverged: hasDiverged(canonical, staged) };
    },
});
