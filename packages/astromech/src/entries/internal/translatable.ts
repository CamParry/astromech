/**
 * Non-translatable fields belong to the locale group, not to one translation:
 * they are inherited from a sibling on create and propagated to siblings on
 * update.
 */

import type { EntryRepository } from '../repository/types';
import type { Field } from '@/types/fields';
import type { Entry, JsonObject, ResolvedEntryType } from '@/types/index';
import { getNonTranslatableFieldNames } from './entry-type';
import { asEntry } from './records';

/**
 * Merges in the locale group's shared fields from an existing sibling. A field
 * marked `translatable: false` belongs to the group, so a new translation
 * takes the sibling's value over whatever the caller sent.
 */
export async function inheritSharedFields(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    values: Record<string, unknown>;
    definitions: Field[];
    localeGroup: string | undefined;
}): Promise<Record<string, unknown>> {
    const { repository, entryType, values, definitions, localeGroup } = params;
    if (localeGroup === undefined || !repository.translatable) return values;

    const shared = getNonTranslatableFieldNames(
        entryType.id,
        definitions.map((field) => field.name)
    );
    if (shared.length === 0) return values;

    const [sibling] = await repository.translatable.siblings(localeGroup);
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
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    entry: Entry;
    fields: JsonObject;
    patchedFieldNames: string[];
}): Promise<void> {
    const { repository, entryType, entry, fields, patchedFieldNames } = params;
    if (!repository.translatable) return;

    const shared = getNonTranslatableFieldNames(entryType.id, patchedFieldNames);
    if (shared.length === 0) return;

    const values: JsonObject = {};
    for (const name of shared) {
        const value = fields[name];
        if (value !== undefined) values[name] = value;
    }
    await repository.translatable.propagateFields(entry.localeGroup, entry.id, values);
}

/**
 * Add each entry's live locale siblings to the batch, deduplicated by id
 * (input entries first). A repository without `translatable` has no siblings to
 * add. Shared by the delete and trash operations for `cascadeLocales`.
 */
export async function withLocaleSiblings(params: {
    repository: EntryRepository;
    entries: readonly Entry[];
}): Promise<Entry[]> {
    const { repository, entries } = params;
    if (!repository.translatable) return entries as Entry[];

    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    for (const entry of entries) {
        const siblings = await repository.translatable.siblings(
            entry.localeGroup,
            entry.id
        );
        for (const sibling of siblings) {
            if (!byId.has(sibling.id)) byId.set(sibling.id, asEntry(sibling));
        }
    }
    return Array.from(byId.values());
}
