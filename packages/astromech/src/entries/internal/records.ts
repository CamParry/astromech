/**
 * Row helpers: narrow a repository row to the public `Entry`, and read one
 * locale (or the whole resource) of an entry of a given type. The type is part
 * of the read, so an entry of another type is not found.
 */

import type { ContentRowId, EntryRepository, EntryRow } from '../repository/types';
import type { Entry, ResolvedConfig } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { ResourceNotFoundError } from '@/errors/resource';

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
 * Read one locale of an entry of the given type. Includes trashed rows and
 * applies no visibility filter; null when the entry, that locale's content row,
 * or an entry of that type is absent.
 */
export async function findEntryOfType(
    config: ResolvedConfig,
    repository: EntryRepository,
    type: string,
    id: string,
    locale?: string
): Promise<EntryRecord | null> {
    const row = await repository.get(
        { type, id, locale: locale ?? defaultContentLocale(config) },
        { includeTrashed: true }
    );
    return row ? asRecord(row) : null;
}

/** `findEntryOfType`, throwing when the entry or that locale's row is missing. */
export async function getEntryOfType(
    config: ResolvedConfig,
    repository: EntryRepository,
    type: string,
    id: string,
    locale?: string
): Promise<EntryRecord> {
    const record = await findEntryOfType(config, repository, type, id, locale);
    if (!record) {
        throw new ResourceNotFoundError('entry', {
            id: id,
            locale: locale ?? defaultContentLocale(config),
        });
    }
    return record;
}

/**
 * Read an entry of the given type for a resource-level operation (trash, delete,
 * preview token), which acts on every locale at once: the default-locale row if
 * there is one, else any other locale's. Trashed entries included.
 */
export async function getEntryResource(
    config: ResolvedConfig,
    repository: EntryRepository,
    type: string,
    id: string
): Promise<EntryRecord> {
    const record = await findEntryOfType(config, repository, type, id);
    if (record) return record;

    const row = await repository.anyLocale?.({ type, id }, { includeTrashed: true });
    if (!row) throw new ResourceNotFoundError('entry', { id: id });
    return asRecord(row);
}

/**
 * Read a batch of entries of the given type at resource level, preserving input
 * order. Shared by the delete, trash and restore operations.
 */
export async function getEntryResources(
    config: ResolvedConfig,
    repository: EntryRepository,
    type: string,
    ids: readonly string[]
): Promise<EntryRecord[]> {
    return Promise.all(ids.map((id) => getEntryResource(config, repository, type, id)));
}
