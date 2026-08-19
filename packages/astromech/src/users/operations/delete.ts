import { createUserRepository } from '../repository';

/** Delete a user row. */
export async function deleteUser(params: { id: string }): Promise<void> {
    await createUserRepository().delete(params.id);
}
