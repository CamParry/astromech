import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { hasDiverged } from '@/content/staging';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { getEntryOfType } from '../../internal/read-entry';
import { entryRepository } from '../../repository/entries-table';
import { stagedEntrySchema } from '../../schema';

/**
 * Returns the staged copy of one locale of an entry, or null if none exists,
 * with `diverged` set when the canonical was written after the copy was made.
 * Throws if the entry does not exist in that locale or is the wrong type.
 */
export const getStagedEntry = defineServiceMethod({
    summary: 'Get the staged change of an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    output: stagedEntrySchema.nullable(),
    access: entryGate('read'),
    requires: 'staging',
    mutates: false,
    async handler(params): Promise<(EntryResource & { diverged: boolean }) | null> {
        const canonical = await getEntryOfType(params.type, params.id, params.locale);
        const { staging } = entryRepository;
        const staged = await staging.findOne({ id: params.id, locale: canonical.locale });
        if (!staged) return null;
        return { ...staged, diverged: hasDiverged(canonical, staged) };
    },
});
