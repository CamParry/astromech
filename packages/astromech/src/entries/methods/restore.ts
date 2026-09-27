import type { EntryResource } from '../repository/types';
import type { AppContext } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { writeBatch } from '../internal/write-batch';
import { getEntryResources } from '../read-entry';
import { entryRepository } from '../repository/entries-table';
import { entrySchema } from '../schema';

/**
 * Restore a batch of trashed entries, atomically, returning each one's
 * default-locale row. Restoring is resource-level: every locale comes back.
 * `restore` declares `requires: 'trash'`, so the type keeps a bin. Fires no
 * hooks, since there is no restore hook event.
 */
async function restoreEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<EntryResource[]> {
    const { type, ids } = params;
    const userId = ctx.user?.id ?? null;
    const entries = await getEntryResources(type, ids);

    return writeBatch(entries, (entry) =>
        entryRepository.trash.restore(entry.id, userId)
    );
}

/** One id is a batch of one, and its result and errors are unwrapped. */
const restoreOne = fromBatch(restoreEntryBatch);

/**
 * Restore one trashed entry or a list of them, atomically, returning each one's
 * default-locale row. Restoring is resource-level: every locale comes back.
 * Throws if the type does not support trash.
 */
export const restoreEntries = defineServiceMethod({
    summary: 'Restore a trashed entry.',
    input: restoreEntriesInput({ type: z.string() }),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryGate('update'),
    requires: 'trash',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return restoreOne(params, ctx);
    },
});

/**
 * `entries.restore`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function restoreEntriesInput<T extends z.ZodType>({ type }: { type: T }) {
    return oneOrMany(z.strictObject({ type, ...batchAddress }));
}
