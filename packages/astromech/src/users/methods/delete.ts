import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { assertKeepsAnAdmin } from '../internal/last-admin';
import { userRepository } from '../repository';

/**
 * Deleting the last admin is refused, and a missing user is a no-op. The database
 * clears the author columns that name the user and removes their sessions,
 * accounts, content rows and notifications.
 */
export const deleteUser = defineServiceMethod({
    summary: 'Delete a CMS user.',
    input: z.strictObject({ id: z.string() }),
    output: z.void(),
    access: 'users:delete',
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params): Promise<void> {
        const { id } = params;

        const userRow = await userRepository.findUserRow(id);
        if (userRow) await assertKeepsAnAdmin(userRow, null);

        // `delete` removes the user's relationship rows, then the user.
        await transaction(() => userRepository.delete(id));
    },
});
