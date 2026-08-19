import type { EntryRepository } from '../repository/types';
import type { Entry } from '@/types/index';
import { runBulk } from '../internal/bulk';
import { asEntry, loadAndAssertType } from '../internal/records';
import { assertCapability } from '../internal/type-config';
import { getEntryRepository } from '../repository/registry';

/** Restore a single trashed entry (policy). */
async function restoreOne(
    repository: EntryRepository,
    type: string,
    id: string
): Promise<Entry> {
    await loadAndAssertType(repository, type, id);
    if (!repository.trash) throw new Error(`Entry type "${type}" does not support trash`);
    return asEntry(await repository.trash.restore(id));
}

export async function restore(params: {
    type: string;
    id: string | readonly string[];
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'trash');
    if (Array.isArray(params.id)) {
        return runBulk(params.type, params.id, (txRepository, _txDb, id) =>
            restoreOne(txRepository, params.type, id)
        );
    }
    return restoreOne(getEntryRepository(params.type), params.type, params.id as string);
}
