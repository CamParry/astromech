import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { entrySchema, updateEntryPayloadSchema } from '../schema';

/** One id is a batch of one, and its result and errors are unwrapped. */
const updateOne = fromBatch(updateEntryBatch);

/**
 * Updates one locale of one entry or a list of them, atomically, firing the
 * entry write hooks around it. A locale with no content row yet is created from
 * the default-locale row, which is how a translation is written; `staged` writes
 * the staged change instead.
 */
export const updateEntries = defineServiceMethod({
    summary:
        'Update an entry. Fields merge: omitted fields keep their current ' +
        'value, and arrays are replaced whole.',
    input: oneOrMany(
        z.object({
            type: z.string(),
            ...batchAddress,
            locale: z.string().optional(),
            staged: z.boolean().optional(),
            // The titleless payload, since one schema covers every type here;
            // `update-batch.ts` re-parses under the type's own, which is stricter.
            data: updateEntryPayloadSchema,
        })
    ),
    output: z.union([entrySchema, z.array(entrySchema)]),
    access: entryGate('update'),
    mutates: true,
    // Re-applying the same update lands the same end-state — matches the core
    // `users.update` idempotent hint.
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return updateOne(params, ctx);
    },
});
