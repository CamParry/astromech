import type { Entry, EntryUpdateData, EntryUpdateParams } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { fromBatch } from '../internal/from-batch';
import { updateEntryBatch } from '../internal/update-batch';
import { updateEntrySchema } from '../schema';

/**
 * The `data` slot, declared as what it describes rather than inferred: the
 * schema parses `fields` as `Record<string, unknown>`, which
 * `exactOptionalPropertyTypes` keeps distinct from `EntryUpdateData`'s
 * `fields?: JsonObject`. Titleless, since one schema covers every type here;
 * `update-batch.ts` re-parses under the type's own, which is the stricter one.
 */
const updateData = updateEntrySchema({
    titled: false,
}) as unknown as z.ZodType<EntryUpdateData>;

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
    input: z.object({
        type: z.string(),
        id: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
        locale: z.string().optional(),
        staged: z.boolean().optional(),
        data: updateData,
    }),
    access: entryGate('update'),
    mutates: true,
    // Re-applying the same update lands the same end-state — matches the core
    // `users.update`/`settings.set` idempotent hint.
    idempotent: true,
    handler(params: EntryUpdateParams, ctx): Promise<Entry | Entry[]> {
        return updateOne(params, ctx);
    },
});
