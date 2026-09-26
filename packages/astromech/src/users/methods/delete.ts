import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { assertKeepsAnAdmin } from '../internal/last-admin';
import { userRepository } from '../repository';

/**
 * Delete a user row, refusing the last admin. The database's `ON DELETE set
 * null` clears the author columns that point at it, and `ON DELETE cascade`
 * removes the user's sessions, accounts, content rows and notifications.
 */
export const deleteUser = defineServiceMethod({
    summary: 'Delete a CMS user.',
    input: z.object({ id: z.string() }),
    output: z.void(),
    access: 'users:delete',
    mutates: true,
    destructive: true,
    async handler(params): Promise<void> {
        const userRow = await userRepository.findUserRow(params.id);
        if (userRow) {
            await assertKeepsAnAdmin(
                userRepository,
                userRow,
                null,
                'Cannot delete the last administrator'
            );
        }
        // One transaction: the repository removes the user's relationship rows
        // before the user row, and neither may go without the other.
        await transaction(async () => {
            await userRepository.delete(params.id);
        });
    },
});
