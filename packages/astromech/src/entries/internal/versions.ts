/**
 * Entry version helpers shared by the operations that write a version.
 */

import type { EntryRepository } from '../repository/types';
import type { Entry, JsonObject } from '@/types/index';
import { getCurrentUser } from '@/request-context/request-context';
import { deepEqual } from './deep-equal';

/**
 * Saves the entry's current state as the next version, credited to the acting
 * user. The caller decides whether a version is warranted; this numbers and
 * writes it. Outside a request (a CLI job, a seed script) there is no author.
 */
export async function snapshotVersion(
    versions: NonNullable<EntryRepository['versions']>,
    entry: Entry
): Promise<void> {
    const latestNumber = await versions.latestNumber(entry.id);
    const user = await getCurrentUser();
    await versions.create({
        entryId: entry.id,
        versionNumber: latestNumber + 1,
        title: entry.title,
        slug: entry.slug,
        fields: entry.fields,
        createdBy: user?.id ?? null,
    });
}

/**
 * True when an update changes something a version preserves: the title, the
 * slug or the fields. An update touching only `status` writes no version.
 */
export function changesVersionedContent(
    current: Entry,
    next: {
        title?: string | undefined;
        slug?: string | undefined;
        fields?: JsonObject | undefined;
    }
): boolean {
    if (next.title !== undefined && next.title !== current.title) return true;
    if (next.slug !== undefined && next.slug !== current.slug) return true;
    return next.fields !== undefined && !deepEqual(current.fields, next.fields);
}
