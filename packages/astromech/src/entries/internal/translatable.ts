/**
 * Non-translatable fields belong to the locale group, not to one translation:
 * they are inherited from a sibling on create and propagated to siblings on
 * update.
 */

import type { EntryStorage } from '../storage/types';
import type { Entry, JsonObject, ResolvedEntryType } from '@/types/index';
import { getNonTranslatableFieldNames } from './type-config';

/**
 * Merges in the locale group's shared fields from an existing sibling. A field
 * marked `translatable: false` belongs to the group, so a new translation
 * takes the sibling's value over whatever the caller sent.
 */
export async function inheritSharedFields(
    values: Record<string, unknown>,
    definitions: { name: string }[],
    context: {
        storage: EntryStorage;
        entryType: ResolvedEntryType;
        localeGroup: string | undefined;
    }
): Promise<Record<string, unknown>> {
    const { storage, entryType, localeGroup } = context;
    if (localeGroup === undefined || !storage.translatable) return values;

    const shared = getNonTranslatableFieldNames(
        entryType.id,
        definitions.map((field) => field.name)
    );
    if (shared.length === 0) return values;

    const [sibling] = await storage.translatable.siblings(localeGroup);
    if (!sibling) return values;

    const inherited: Record<string, unknown> = {};
    for (const name of shared) {
        if (sibling.fields[name] !== undefined) inherited[name] = sibling.fields[name];
    }
    return { ...values, ...inherited };
}

/**
 * Copies the shared fields an update touched out to the entry's sibling
 * locales. Only the names the caller actually patched are sent: the merged
 * document holds every field, and propagating an untouched one would
 * overwrite its siblings.
 */
export async function propagateSharedFields(params: {
    storage: EntryStorage;
    entryType: ResolvedEntryType;
    entry: Entry;
    fields: JsonObject;
    patchedFieldNames: string[];
}): Promise<void> {
    const { storage, entryType, entry, fields, patchedFieldNames } = params;
    if (!storage.translatable) return;

    const shared = getNonTranslatableFieldNames(entryType.id, patchedFieldNames);
    if (shared.length === 0) return;

    const values: JsonObject = {};
    for (const name of shared) {
        const value = fields[name];
        if (value !== undefined) values[name] = value;
    }
    await storage.translatable.propagateFields(entry.localeGroup, entry.id, values);
}
