import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { hasDiverged } from '@/content/staging';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryOfType } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';
import { stagedEntrySchema } from '../../schema';

/**
 * Returns the staged copy of one locale of an entry, or null if none exists,
 * with `diverged` set when the canonical was written after the copy was made.
 * Throws if the entry does not exist in that locale or is the wrong type.
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
        const { staging } = entryRepository;
        const staged = await staging.findOne({ id, locale: canonical.locale });
        if (!staged) return null;
        return { ...staged, diverged: hasDiverged(canonical, staged) };
    },
});
