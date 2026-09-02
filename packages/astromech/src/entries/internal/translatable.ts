/**
 * Entries' adapter over the shared translatable helpers: it reads what the
 * entry type says about translation and hands the rest to `content/`.
 */

import type { EntryRepository } from '../repository/types';
import type { Field } from '@/types/fields';
import type { JsonObject, ResolvedEntryType } from '@/types/index';
import {
    inheritSharedFields as inheritContentFields,
    propagateSharedFields as propagateContentFields,
} from '@/content/translatable';
import { flattenEntryFields } from '@/fields/flatten';
import { getDefaultContentLocale } from './entry-type';

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
    return inheritContentFields({
        repository: params.repository,
        values: params.values,
        definitions: params.definitions,
        translatable: params.entryType.translatable === true,
        id: params.entryId,
        locale: params.locale,
        defaultLocale: getDefaultContentLocale(),
    });
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
    return propagateContentFields({
        translatable: params.repository.translatable,
        definitions: flattenEntryFields(params.entryType.fields),
        isTranslatable: params.entryType.translatable === true,
        record: params.entry,
        fields: params.fields,
        patchedFieldNames: params.patchedFieldNames,
    });
}
