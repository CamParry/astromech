import type { User } from '@/types/index';
import { createUserStorage } from '../storage';
import { toUser } from '../internal/to-user';

/** Read one user by id, or null when there is no such row. */
export async function get(params: { id: string }): Promise<User | null> {
    const row = await createUserStorage().get(params.id);
    return row ? toUser(row) : null;
}
