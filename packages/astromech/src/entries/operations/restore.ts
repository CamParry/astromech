import type { EntryRepository } from '../repository/types';
import type { Entry } from '@/types/index';
import { runOnIds } from '../internal/bulk';
import { asEntry, loadAndAssertType } from '../internal/records';
import { assertCapability } from '../internal/type-config';

/**
 * Restore one trashed entry or many, atomically per batch, returning the
 * restored rows. Throws if the type does not support trash.
 */
export async function restore(params: {
    type: string;
    id: string | readonly string[];
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'trash');
    return runOnIds(params.type, params.id, (repository, _db, id) =>
        restoreOne(repository, params.type, id)
    );
}

/** Restore a single trashed entry. Throws if the type does not support trash. */
async function restoreOne(
    repository: EntryRepository,
    type: string,
    id: string
): Promise<Entry> {
    await loadAndAssertType(repository, type, id);
    if (!repository.trash) throw new Error(`Entry type "${type}" does not support trash`);
    return asEntry(await repository.trash.restore(id));
}
