import type { BuiltInRoleSlug } from '@/permissions/roles';
import { LastAdminError } from '../errors';
import { userRepository } from '../repository';

const ADMIN: BuiltInRoleSlug = 'admin';

/**
 * Refuses a write that takes the `admin` role from `current` when no other user
 * holds it. `nextRole` is the role the write leaves, or null for a delete.
 */
export async function assertKeepsAnAdmin(
    current: { role: string },
    nextRole: string | null
): Promise<void> {
    if (current.role !== ADMIN || nextRole === ADMIN) return;
    const admins = await userRepository.countByRole(ADMIN);
    if (admins > 1) return;
    throw new LastAdminError(
        nextRole === null
            ? 'Cannot delete the last administrator'
            : 'Cannot remove the last administrator'
    );
}
