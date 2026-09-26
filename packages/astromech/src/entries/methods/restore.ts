import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { restoreEntryBatch } from '../internal/restore-batch';
import { entrySchema } from '../schema';

/** One id is a batch of one, and its result and errors are unwrapped. */
const restoreOne = fromBatch(restoreEntryBatch);

/**
 * Restore one trashed entry or a list of them, atomically, returning each one's
 * default-locale row. Restoring is resource-level: every locale comes back.
 * Throws if the type does not support trash.
 */
export const restoreEntries = defineServiceMethod({
    summary: 'Restore a trashed entry.',
    input: oneOrMany(
        z.object({
            type: z.string(),
            ...batchAddress,
        })
    ),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryGate('update'),
    requires: 'trash',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return restoreOne(params, ctx);
    },
});
