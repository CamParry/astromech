import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { entryListFilters } from '../internal/list-filters';
import { entryRepository } from '../repository/entries-table';

/**
 * Counts each named type apart, keyed by type, over the rows `query` lists for
 * the same type, locale and shape, so a page counting several types asks once.
 */
export const countEntries = defineServiceMethod({
    summary: 'Count the entries of each type.',
    input: z.strictObject({
        type: z.union([z.string(), z.array(z.string())]),
        locale: z.string().optional(),
        full: z.boolean().optional(),
    }),
    output: z.record(z.string(), z.number().int()),
    access: entryAccess('read'),
    mutates: false,
    async handler(params, ctx): Promise<Record<string, number>> {
        const { type, full } = params;
        const { config } = ctx;
        const types = Array.isArray(type) ? type : [type];
        const shape = full === true ? 'full' : 'public';
        const now = new Date();

        const counts: Record<string, number> = {};
        for (const one of types) {
            const filters = entryListFilters(
                config,
                { types: [one], locale: params.locale, shape },
                now
            );
            counts[one] = await entryRepository.count(filters);
        }
        return counts;
    },
});
