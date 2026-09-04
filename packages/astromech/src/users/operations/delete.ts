import { transaction } from '@/database/transaction';
import { clearAuthorReferences } from '../internal/clear-author-references';
import { createUserRepository } from '../repository';

/** Delete a user row, first nulling their author references across the schema. */
export async function deleteUser(params: { id: string }): Promise<void> {
    // One transaction: author columns pointing at a row that is gone, or a row
    // gone with its authorship intact, are both states nothing repairs.
    await transaction(async () => {
        await clearAuthorReferences(params.id);
        await createUserRepository().delete(params.id);
    });
}
