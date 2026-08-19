import type { User } from '@/types/index';
import { toUser } from '../internal/to-user';
import { createUserStorage } from '../storage';

/** Read one user by id, or null when there is no such row. */
export async function get(params: { id: string }): Promise<User | null> {
    const row = await createUserStorage().get(params.id);
    return row ? toUser(row) : null;
}
