import { createUserStorage } from '../storage';

/** Delete a user row. */
export async function deleteUser(params: { id: string }): Promise<void> {
    await createUserStorage().delete(params.id);
}
