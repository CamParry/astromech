import type { EntryResource } from '../repository/types';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { entrySchema, updateEntryPayloadSchema } from '../schema';

/**
 * Takes one `id` or a list of `ids`, written atomically. A locale with no content
 * row is created from the default locale's, firing the create hooks rather than
 * the update hooks; `staged` writes the staged change instead.
 */
export const updateEntries = defineServiceMethod({
    summary:
        'Update an entry. Fields merge: omitted fields keep their current ' +
        'value, and arrays are replaced whole.',
    input: oneOrMany(
        z.strictObject({
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
    access: entryAccess('update'),
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<EntryResource | EntryResource[]> {
        return updateOne(params, ctx);
    },
});

const updateOne = fromBatch(updateEntryBatch);
