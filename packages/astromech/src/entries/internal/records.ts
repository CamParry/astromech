/**
 * Row helpers: narrow a repository row to the public `Entry`, and read one or
 * many entries of a given type (the type-mismatch guard the service applies
 * before every by-id operation).
 */

import type { EntryRepository, EntryRow } from '../repository/types';
import type { Entry } from '@/types/index';
import { EntryTypeMismatchError } from '../errors';

/**
 * Narrow a repository `EntryRow` to the public `Entry`. The contract is
 * intentionally wider than `Entry` so a repository need not carry every
 * capability column.
 */
export function asEntry(row: EntryRow): Entry {
    return row as Entry;
}

/**
 * Read an entry by id and assert it is of the given type. Includes trashed rows
 * and applies no visibility filter; throws when the row is missing or is of
 * another type.
 */
export async function getEntryOfType(
    repository: EntryRepository,
    type: string,
    id: string
): Promise<Entry> {
    const row = await repository.get(id, { includeTrashed: true });
    if (!row) throw new Error(`Entry '${id}' not found`);
    if (row.type !== undefined && row.type !== type) {
        throw new EntryTypeMismatchError({
            entryId: id,
            expectedType: type,
            actualType: row.type,
        });
    }
    return row as Entry;
}

/**
 * Read a batch of entries of the given type, preserving input order. The batch
 * form of `getEntryOfType`, shared by the delete, trash and restore operations.
 */
export async function getEntriesOfType(
    repository: EntryRepository,
    type: string,
    ids: readonly string[]
): Promise<Entry[]> {
    return Promise.all(ids.map((id) => getEntryOfType(repository, type, id)));
}
