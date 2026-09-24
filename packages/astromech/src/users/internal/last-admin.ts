/**
 * The last-admin guard: a site always keeps one user holding the built-in
 * `admin` role, whichever transport the demotion or deletion arrives through.
 */

import type { UserRepository } from '../repository';
import type { BuiltInRoleSlug } from '@/permissions/roles';
import { LastAdminError } from '../errors';

const ADMIN: BuiltInRoleSlug = 'admin';

/**
 * Refuse to take the `admin` role away from `current` when it is the only user
 * holding it. `nextRole` is the role the write leaves it with, null for a delete.
 */
export async function assertKeepsAnAdmin(
    repository: UserRepository,
    current: { role: string },
    nextRole: string | null,
    message: string
): Promise<void> {
    if (current.role !== ADMIN || nextRole === ADMIN) return;
    const admins = await repository.owners.count({ role: ADMIN });
    if (admins <= 1) throw new LastAdminError(message);
}
