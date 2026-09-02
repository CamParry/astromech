/**
 * Row helpers: narrow a repository row to the public `Entry`, and read one
 * locale (or the whole resource) of an entry of a given type — the type-mismatch
 * guard the service applies before every by-id operation.
 */

import type { ContentRowId, EntryRepository, EntryRow } from '../repository/types';
import type { Entry } from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { EntryNotFoundError, EntryTypeMismatchError } from '../errors';

/**
 * One locale of one entry as the operations read it: the public shape plus the
 * content row it came from, which versions and staging key on.
 */
export type EntryRecord = Entry & { contentId: ContentRowId };

/**
 * Narrow a repository `EntryRow` to the public `Entry`. The contract is
 * intentionally wider than `Entry` so a repository need not carry every
 * capability column; `contentId` is dropped, as it never leaves the service.
 */
export function asEntry(row: EntryRow): Entry {
    const { contentId: _contentId, ...entry } = asRecord(row);
    return entry;
}

/** The same narrowing, keeping the content row an operation still needs. */
export function asRecord(row: EntryRow): EntryRecord {
    return row as EntryRecord;
}

/**
 * Read one locale of an entry and assert it is of the given type. Includes
 * trashed rows and applies no visibility filter; null when the entry or that
 * locale's content row is absent, and throws on a type mismatch.
 */
export async function findEntryOfType(
    repository: EntryRepository,
    type: string,
    id: string,
    locale?: string
): Promise<EntryRecord | null> {
    const row = await repository.get(
        { id, locale: locale ?? getDefaultContentLocale() },
        { includeTrashed: true }
    );
    if (!row) return null;
    assertType(row, type, id);
    return asRecord(row);
}

/** `findEntryOfType`, throwing when the entry or that locale's row is missing. */
export async function getEntryOfType(
    repository: EntryRepository,
    type: string,
    id: string,
    locale?: string
): Promise<EntryRecord> {
    const record = await findEntryOfType(repository, type, id, locale);
    if (!record) {
        throw new EntryNotFoundError({
            entryId: id,
            locale: locale ?? getDefaultContentLocale(),
        });
    }
    return record;
}

/**
 * Read an entry for a resource-level operation (trash, delete, preview token),
 * which acts on every locale at once: the default-locale row if there is one,
 * else any other locale's. Trashed entries included, so a trashed entry with no
 * default-locale row can still be restored and deleted.
 */
export async function getEntryResource(
    repository: EntryRepository,
    type: string,
    id: string
): Promise<EntryRecord> {
    const record = await findEntryOfType(repository, type, id);
    if (record) return record;

    const row = await repository.anyLocale?.(id, { includeTrashed: true });
    if (!row) throw new EntryNotFoundError({ entryId: id });
    assertType(row, type, id);
    return asRecord(row);
}

/**
 * Read a batch of entries of the given type at resource level, preserving input
 * order. Shared by the delete, trash and restore operations.
 */
export async function getEntryResources(
    repository: EntryRepository,
    type: string,
    ids: readonly string[]
): Promise<EntryRecord[]> {
    return Promise.all(ids.map((id) => getEntryResource(repository, type, id)));
}

/** A repository may answer for one type only, so a row of another is a fault. */
function assertType(row: EntryRow, type: string, id: string): void {
    if (row.type !== undefined && row.type !== type) {
        throw new EntryTypeMismatchError({
            entryId: id,
            expectedType: type,
            actualType: row.type,
        });
    }
}
