import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { createUserRepository } from '../repository';

/**
 * Delete a user row. The database's `ON DELETE set null` clears the author
 * columns that point at it, and `ON DELETE cascade` removes the user's
 * sessions, accounts, content rows and notifications.
 */
export const deleteUser = defineServiceMethod({
    summary: 'Delete a CMS user.',
    input: z.object({ id: z.string() }),
    access: 'users:delete',
    mutates: true,
    destructive: true,
    async handler(params): Promise<void> {
        // One transaction: the repository removes the user's relationship rows
        // before the user row, and neither may go without the other.
        await transaction(async () => {
            await createUserRepository().delete(params.id);
        });
    },
});
