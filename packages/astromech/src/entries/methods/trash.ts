import { z } from '@hono/zod-openapi';
import { relationshipRepository } from '@/content/repository/relationships';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { trashEntryBatch } from '../internal/delete-batch';
import { batchAddress, fromBatch, oneOrMany } from '../internal/from-batch';
import { entryRepository } from '../repository/entries-table';

/** One id is a batch of one, and its errors are unwrapped. */
const trashOne = fromBatch(trashEntryBatch);

/**
 * Soft-delete one entry or a list of them, atomically, firing the entry delete
 * hooks around the write. Trashing is resource-level: every locale of an entry
 * goes with it. Throws if the type does not support trash.
 */
export const trashEntries = defineServiceMethod({
    summary: 'Move an entry to the trash (reversible).',
    input: oneOrMany(
        z.object({
            type: z.string(),
            ...batchAddress,
        })
    ),
    access: entryGate('delete'),
    requires: 'trash',
    mutates: true,
    // NOT destructive: trash is the reversible half of the delete pair —
    // `restore` undoes it. `emptyTrash` and `delete` are the ones that lose
    // data, and both declare the flag.
    idempotent: true,
    handler(params, ctx): Promise<void> {
        return trashOne(params, ctx);
    },
});

/**
 * Permanently delete every trashed entry of the type, clearing their
 * relationship rows first. Throws if the type does not support trash.
 */
export const emptyTrash = defineServiceMethod({
    summary: 'Permanently delete every trashed entry of one type.',
    input: z.object({ type: z.string() }),
    access: entryGate('delete'),
    requires: 'trash',
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params): Promise<void> {
        const { type } = params;
        const trashed = await entryRepository.findMany({
            type,
            locale: 'all',
            trashed: true,
        });

        await transaction(async () => {
            for (const entryId of new Set(trashed.map((entry) => entry.id))) {
                await relationshipRepository.deleteByResource(entryId, 'entry');
            }
            await entryRepository.trash.emptyTrash(type);
        });
    },
});
