import type { User } from '@/types/index';
import { toUser } from '../internal/to-user';
import { createUserRepository } from '../repository';

/** Read one user by id, or null when there is no such row. */
export async function getUser(params: { id: string }): Promise<User | null> {
    const row = await createUserRepository().get(params.id);
    return row ? toUser(row) : null;
}
