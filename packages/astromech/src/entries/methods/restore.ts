import type { EntryResource } from '../repository/types';
import type { AppContext } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { writeBatch } from '../internal/write-batch';
import { getEntryResources } from '../read-entry';
import { entryRepository } from '../repository/entries-table';
import { entrySchema } from '../schema';

/**
 * Takes one `id` or a list of `ids`, restored atomically with every locale, and
 * answers each one's default-locale row. No hooks fire, since there is no
 * restore hook event.
 */
export const restoreEntries = defineServiceMethod({
    summary: 'Restore a trashed entry.',
    input: oneOrMany(z.strictObject({ type: z.string(), ...batchAddress })),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryAccess('update'),
    requires: 'trash',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return restoreOne(params, ctx);
    },
});

const restoreOne = fromBatch(restoreEntryBatch);

async function restoreEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<EntryResource[]> {
    const { type, ids } = params;
    const { user } = ctx;
    const userId = user?.id ?? null;

    const entries = await getEntryResources(type, ids);

    return writeBatch(entries, (entry) =>
        entryRepository.trash.restore(entry.id, userId)
    );
}
