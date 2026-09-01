/**
 * Non-translatable fields belong to the entry, not to one of its locales: they
 * are inherited from the default-locale row when a translation is written, and
 * propagated to the other locales when the default one is updated.
 */

import type { EntryRepository } from '../repository/types';
import type { Field } from '@/types/fields';
import type { JsonObject, ResolvedEntryType } from '@/types/index';
import { getDefaultContentLocale, getNonTranslatableFieldNames } from './entry-type';

/**
 * Merges the entry's shared fields in from its default-locale row. A field
 * marked `translatable: false` belongs to the entry, so a new translation takes
 * the stored value over whatever the caller sent.
 */
export async function inheritSharedFields(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    values: Record<string, unknown>;
    definitions: Field[];
    /** The entry being translated; absent when the entry is being created. */
    entryId: string | undefined;
    locale: string;
}): Promise<Record<string, unknown>> {
    const { repository, entryType, values, definitions, entryId, locale } = params;
    const defaultLocale = getDefaultContentLocale();
    if (entryId === undefined || locale === defaultLocale) return values;

    const shared = getNonTranslatableFieldNames(
        entryType.id,
        definitions.map((field) => field.name)
    );
    if (shared.length === 0) return values;

    const source = await repository.get(
        { id: entryId, locale: defaultLocale },
        { includeTrashed: true }
    );
    if (!source) return values;

    const inherited: Record<string, unknown> = {};
    for (const name of shared) {
        if (source.fields[name] !== undefined) inherited[name] = source.fields[name];
    }
    return { ...values, ...inherited };
}

/**
 * Copies the shared fields an update touched out to the entry's other locales.
 * Only the names the caller actually patched are sent: the merged document
 * holds every field, and propagating an untouched one would overwrite them.
 */
export async function propagateSharedFields(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    entry: { id: string; locale: string };
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
    await repository.translatable.propagateFields(entry.id, entry.locale, values);
}
