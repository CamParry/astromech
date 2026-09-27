import type { Usage } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { usageSchema } from '@/content/schema';
import { listUsage } from '@/content/usage';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { getEntryResource } from '../internal/read-entry';

/**
 * Every reference to an entry, from any resource: what the delete check lists.
 * One row per reference, so a source referencing the entry twice is two rows.
 */
export const listEntryUsage = defineServiceMethod({
    summary: 'List the entries, globals, users and media items that reference an entry.',
    input: listEntryUsageInput({ type: z.string() }),
    output: z.array(usageSchema),
    access: entryGate('read'),
    mutates: false,
    async handler(params, ctx): Promise<Usage[]> {
        // The entry must exist as this type, so an unknown id answers 404.
        await getEntryResource(params.type, params.id);
        return listUsage(ctx.config, { id: params.id, kind: 'entry' });
    },
});

/**
 * `entries.usedBy`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function listEntryUsageInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string() });
}
