/**
 * Row helpers: narrow a repository row to the public `Entry`, and read one
 * locale (or the whole resource) of an entry of a given type. The type is part
 * of the read, so an entry of another type is not found.
 */

import type { EntryRepository, EntryRow } from '../repository/types';
import type { ContentRowId } from '@/content/repository/types';
import type { Entry, ResolvedConfig } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { ResourceNotFoundError } from '@/errors/resource';

/**
 * One locale of one entry as the operations read it: the public shape plus the
 * content row it came from, which versions and staging key on.
 */
export type EntryWithContentId = Entry & { contentId: ContentRowId };

/**
 * Narrow a repository `EntryRow` to the public `Entry`. The contract is
 * intentionally wider than `Entry` so a repository need not carry every
 * capability column; `contentId` is dropped, as it never leaves the service.
 */
export function toEntry(row: EntryRow): Entry {
    const { contentId: _contentId, ...entry } = toEntryWithContentId(row);
    return entry;
}

/** The same narrowing, keeping the content row an operation still needs. */
export function toEntryWithContentId(row: EntryRow): EntryWithContentId {
    return row as EntryWithContentId;
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
): Promise<EntryWithContentId | null> {
    const row = await repository.get(
        { type, id, locale: locale ?? defaultContentLocale(config) },
        { includeTrashed: true }
    );
    return row ? toEntryWithContentId(row) : null;
}

/** `findEntryOfType`, throwing when the entry or that locale's row is missing. */
export async function getEntryOfType(
    config: ResolvedConfig,
    repository: EntryRepository,
    type: string,
    id: string,
    locale?: string
): Promise<EntryWithContentId> {
    const entry = await findEntryOfType(config, repository, type, id, locale);
    if (!entry) {
        throw new ResourceNotFoundError('entry', {
            id: id,
            locale: locale ?? defaultContentLocale(config),
        });
    }
    return entry;
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
): Promise<EntryWithContentId> {
    const entry = await findEntryOfType(config, repository, type, id);
    if (entry) return entry;

    const row = await repository.anyLocale?.({ type, id }, { includeTrashed: true });
    if (!row) throw new ResourceNotFoundError('entry', { id: id });
    return toEntryWithContentId(row);
}

/**
 * Every live row of one type in one locale, staged rows excluded: what a
 * uniqueness check scans.
 */
export async function listEntryRows(
    repository: EntryRepository,
    type: string,
    locale: string
): Promise<EntryRow[]> {
    const { data } = await repository.list({
        type,
        locale,
        trashed: false,
        limit: 'all',
    });
    return data;
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
): Promise<EntryWithContentId[]> {
    return Promise.all(ids.map((id) => getEntryResource(config, repository, type, id)));
}
