import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { clearAuthorReferences } from '../internal/clear-author-references';
import { createUserRepository } from '../repository';

/** Delete a user row, first nulling their author references across the schema. */
export const deleteUser = defineServiceMethod({
    summary: 'Delete a CMS user.',
    input: z.object({ id: z.string() }),
    access: 'users:delete',
    mutates: true,
    destructive: true,
    async handler(params: { id: string }): Promise<void> {
        // One transaction: author columns pointing at a row that is gone, or a
        // row gone with its authorship intact, are both states nothing repairs.
        await transaction(async () => {
            await clearAuthorReferences(params.id);
            await createUserRepository().delete(params.id);
        });
    },
});
