import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { trashEntryBatch } from '../internal/delete-batch';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';

/**
 * Takes one `id` or a list of `ids`, trashed atomically with every locale, firing
 * the entry delete hooks with `permanent: false`. `restore` brings them back.
 */
export const trashEntries = defineServiceMethod({
    summary: 'Move an entry to the trash (reversible).',
    input: trashEntriesInput({ type: z.string() }),
    output: z.void(),
    access: entryAccess('delete'),
    requires: 'trash',
    mutates: true,
    // Not destructive, unlike `delete` and `emptyTrash`: `restore` undoes it.
    idempotent: true,
    handler(params, ctx): Promise<void> {
        return trashOne(params, ctx);
    },
});

/**
 * `entries.trash`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function trashEntriesInput<T extends z.ZodType>({ type }: { type: T }) {
    return oneOrMany(z.strictObject({ type, ...batchAddress }));
}

const trashOne = fromBatch(trashEntryBatch);
