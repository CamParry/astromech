import { z } from '@hono/zod-openapi';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { CapabilityError } from '../errors';
import { entryGate } from '../internal/access';
import { assertCapability } from '../internal/entry-type';
import { fromBatch } from '../internal/from-batch';
import { trashEntryBatch } from '../internal/trash-batch';
import { getEntryRepository } from '../repository/registry';

/** One id is a batch of one, and its errors are unwrapped. */
const trashOne = fromBatch(trashEntryBatch);

/**
 * Soft-delete one entry or a list of them, atomically, firing the entry delete
 * hooks around the write. Trashing is resource-level: every locale of an entry
 * goes with it. Throws if the type does not support trash.
 */
export const trashEntries = defineServiceMethod({
    summary: 'Move an entry to the trash (reversible).',
    input: z.object({
        type: z.string(),
        id: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    }),
    access: entryGate('delete'),
    requires: 'trash',
    mutates: true,
    // NOT destructive: trash is the reversible half of the delete pair —
    // `restore` undoes it. `emptyTrash` and `delete` are the ones that lose
    // data, and both declare the flag.
    idempotent: true,
    handler(
        params: { type: string; id: string | readonly string[] },
        ctx
    ): Promise<void> {
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
    async handler(params: { type: string }, ctx): Promise<void> {
        const { type } = params;
        const repository = getEntryRepository(type);
        assertCapability(ctx.config, type, 'trash');
        const { trash } = repository;
        if (!trash) throw new CapabilityError(type, 'trash');

        const { data: trashed } = await repository.list({
            type,
            locale: 'all',
            trashed: true,
            limit: 'all',
        });
        const relationships = createRelationshipRepository();

        await transaction(async () => {
            for (const entryId of new Set(trashed.map((entry) => entry.id))) {
                await relationships.deleteByResource(entryId, 'entry');
            }
            await trash.emptyTrash(type);
        });
    },
});
