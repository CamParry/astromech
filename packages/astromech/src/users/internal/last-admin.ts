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
    throw lastAdminError(nextRole === null ? 'delete' : 'demote');
}

/**
 * The refusal for a write that would take the `admin` role from the last user
 * holding it, whether the count above or the write's own `WHERE` caught it.
 */
export function lastAdminError(write: 'demote' | 'delete'): LastAdminError {
    return new LastAdminError(
        write === 'delete'
            ? 'Cannot delete the last administrator'
            : 'Cannot remove the last administrator'
    );
}
