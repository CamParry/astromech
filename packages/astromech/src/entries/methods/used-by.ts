import type { Usage } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { usageSchema } from '@/content/schema';
import { listUsage } from '@/content/usage';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { getEntryResource } from '../read-entry';

/**
 * What the delete check lists. One row per reference, so a source that references
 * the entry twice is two rows. A missing entry, or one of another type, throws.
 */
export const listEntryUsage = defineServiceMethod({
    summary: 'List the entries, globals, users and media items that reference an entry.',
    input: listEntryUsageInput({ type: z.string() }),
    output: z.array(usageSchema),
    access: entryAccess('read'),
    mutates: false,
    async handler(params, ctx): Promise<Usage[]> {
        const { type, id } = params;
        const { config } = ctx;

        await getEntryResource(type, id);

        return listUsage(config, { id, kind: 'entry' });
    },
});

/**
 * `entries.usedBy`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function listEntryUsageInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string() });
}
