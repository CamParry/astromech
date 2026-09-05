import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { deleteEntryBatch } from '../internal/delete-batch';
import { fromBatch } from '../internal/from-batch';

/** One id is a batch of one, and its errors are unwrapped. */
const deleteOne = fromBatch(deleteEntryBatch);

/**
 * Permanently delete one entry or a list of them, atomically, firing the entry
 * delete hooks around the write. Deleting is resource-level: every locale of an
 * entry goes with it.
 */
export const deleteEntries = defineServiceMethod({
    summary: 'Delete an entry.',
    input: z.object({
        type: z.string(),
        id: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    }),
    access: entryGate('delete'),
    mutates: true,
    destructive: true,
    handler(
        params: { type: string; id: string | readonly string[] },
        ctx
    ): Promise<void> {
        return deleteOne(params, ctx);
    },
});
