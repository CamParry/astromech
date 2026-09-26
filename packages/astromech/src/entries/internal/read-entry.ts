/**
 * Read helpers: narrow an `EntryResource` to the public `Entry`, and read one
 * locale (or the whole resource) of an entry of a given type. The type is part
 * of the read, so an entry of another type is not found.
 */

import type { EntryResource } from '../repository/types';
import type { Resource } from '@/content/repository/types';
import type { Entry } from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { ResourceNotFoundError } from '@/errors/resource';
import { entryRepository } from '../repository/entries-table';

/**
 * One locale of one entry as the operations read it: the public shape plus the
 * content row it came from and that row's timestamps, which versions and
 * staging key on.
 */
export type EntryWithContentId = Entry &
    Pick<Resource, 'contentId' | 'contentCreatedAt' | 'contentUpdatedAt'>;

/**
 * Narrow a read to the public `Entry`, key by key, so the content row's id and
 * timestamps never leave the service.
 */
export function toEntry(resource: Entry): Entry {
    return {
        id: resource.id,
        type: resource.type,
        locale: resource.locale,
        locales: resource.locales,
        slug: resource.slug,
        title: resource.title,
        fields: resource.fields,
        status: resource.status,
        staged: resource.staged,
        publishedAt: resource.publishedAt,
        deletedAt: resource.deletedAt,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
        createdBy: resource.createdBy ?? null,
        updatedBy: resource.updatedBy ?? null,
    };
}

/** The same narrowing, keeping the content row an operation still needs. */
export function toEntryWithContentId(resource: EntryResource): EntryWithContentId {
    return resource;
}

/**
 * Read one locale of an entry of the given type; the default locale when
 * `locale` is absent. Includes trashed rows and applies no visibility filter;
 * null when the entry, that locale's content row, or an entry of that type is absent.
 */
export async function findEntryOfType(
    type: string,
    id: string,
    locale?: string
): Promise<EntryWithContentId | null> {
    const row = await entryRepository.findOne(
        { type, id, locale },
        { includeTrashed: true }
    );
    return row ? toEntryWithContentId(row) : null;
}

/** `findEntryOfType`, throwing when the entry or that locale's row is missing. */
export async function getEntryOfType(
    type: string,
    id: string,
    locale?: string
): Promise<EntryWithContentId> {
    const entry = await findEntryOfType(type, id, locale);
    if (!entry) {
        throw new ResourceNotFoundError('entry', {
            id,
            locale: locale ?? getDefaultContentLocale(),
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
    type: string,
    id: string
): Promise<EntryWithContentId> {
    const row = await entryRepository.findAnyLocale(
        { type, id },
        { includeTrashed: true }
    );
    if (!row) throw new ResourceNotFoundError('entry', { id });
    return toEntryWithContentId(row);
}

/**
 * Every live entry of one type in one locale, staged content excluded: what a
 * uniqueness check scans.
 */
export async function listEntriesInLocale(
    type: string,
    locale: string
): Promise<EntryResource[]> {
    return entryRepository.findMany({ type, locale, trashed: false });
}

/**
 * Read a batch of entries of the given type at resource level, preserving input
 * order. Shared by the delete, trash and restore operations.
 */
export async function getEntryResources(
    type: string,
    ids: readonly string[]
): Promise<EntryWithContentId[]> {
    return Promise.all(ids.map((id) => getEntryResource(type, id)));
}
