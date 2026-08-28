import { clearAuthorReferences } from '@/entries/internal/clear-author-references';
import { createUserRepository } from '../repository';

/** Delete a user row, first nulling their author references on entries. */
export async function deleteUser(params: { id: string }): Promise<void> {
    // Null author references before removing the row: the FK is `set null`, but
    // libSQL does not enforce it, so clear it here for uniform cross-driver behaviour.
    await clearAuthorReferences(params.id);
    await createUserRepository().delete(params.id);
}
