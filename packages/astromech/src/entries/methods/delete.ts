import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { deleteEntryBatch } from '../internal/delete-batch';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';

/** One id is a batch of one, and its errors are unwrapped. */
const deleteOne = fromBatch(deleteEntryBatch);

/**
 * Permanently delete one entry or a list of them, atomically, firing the entry
 * delete hooks around the write. Deleting is resource-level: every locale of an
 * entry goes with it.
 */
export const deleteEntries = defineServiceMethod({
    summary: 'Delete an entry.',
    input: deleteEntriesInput({ type: z.string() }),
    output: z.void(),
    access: entryAccess('delete'),
    mutates: true,
    destructive: true,
    handler(params, ctx): Promise<void> {
        return deleteOne(params, ctx);
    },
});

/**
 * `entries.delete`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function deleteEntriesInput<T extends z.ZodType>({ type }: { type: T }) {
    return oneOrMany(z.strictObject({ type, ...batchAddress }));
}
