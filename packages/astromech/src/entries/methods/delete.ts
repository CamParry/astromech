import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { deleteEntryBatch } from '../internal/delete-batch';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';

/**
 * Takes one `id` or a list of `ids`, deleted atomically with every locale and
 * version. A missing id, or one of another type, throws before any hook fires.
 */
export const deleteEntries = defineServiceMethod({
    summary: 'Delete an entry.',
    input: oneOrMany(z.strictObject({ type: z.string(), ...batchAddress })),
    output: z.void(),
    access: entryAccess('delete'),
    mutates: true,
    destructive: true,
    handler(params, ctx): Promise<void> {
        return deleteOne(params, ctx);
    },
});

const deleteOne = fromBatch(deleteEntryBatch);
