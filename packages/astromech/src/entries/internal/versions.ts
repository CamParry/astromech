/**
 * Entry version helpers shared by the operations that write a version.
 */

import type { EntryStorage } from '../storage/types';
import type { Entry, JsonObject } from '@/types/index';
import { deepEqual } from './deep-equal';

/**
 * Saves the entry's current state as the next version. The caller decides
 * whether a version is warranted; this numbers and writes it.
 */
export async function snapshotVersion(
    versions: NonNullable<EntryStorage['versions']>,
    entry: Entry
): Promise<void> {
    const latestNumber = await versions.latestNumber(entry.id);
    await versions.create({
        entryId: entry.id,
        versionNumber: latestNumber + 1,
        title: entry.title,
        slug: entry.slug,
        fields: entry.fields,
        createdBy: null,
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
