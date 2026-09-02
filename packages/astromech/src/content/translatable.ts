/**
 * Non-translatable fields belong to the item, not to one of its locales: they
 * are inherited from the default-locale row when a translation is written, and
 * propagated to the other locales when the default one is updated. Shared by
 * every resource with per-locale content; the resource supplies its field
 * definitions and its repository's `translatable` group.
 */

import type { ContentRef, ContentRow } from './repository/types';
import type { Field } from '@/types/fields';
import type { JsonObject } from '@/types/index';

/** The read `inheritSharedFields` needs: one locale of one item. */
type ContentReader = {
    get(
        ref: ContentRef,
        opts?: { includeTrashed?: boolean }
    ): Promise<Pick<ContentRow, 'fields'> | null>;
};

/** The write `propagateSharedFields` needs. */
type FieldPropagator = {
    propagateFields(id: string, excludeLocale: string, values: JsonObject): Promise<void>;
};

/**
 * The subset of `names` whose definitions are marked `translatable: false`.
 * Empty when the resource itself is not translatable.
 */
export function sharedFieldNames(
    definitions: readonly Field[],
    names: readonly string[],
    translatable: boolean
): string[] {
    if (!translatable) return [];
    return definitions
        .filter((field) => field.translatable === false && names.includes(field.name))
        .map((field) => field.name);
}

/**
 * Merges the item's shared fields in from its default-locale row. A field
 * marked `translatable: false` belongs to the item, so a new translation takes
 * the stored value over whatever the caller sent.
 */
export async function inheritSharedFields(params: {
    repository: ContentReader;
    values: Record<string, unknown>;
    definitions: readonly Field[];
    translatable: boolean;
    /** The item being translated; absent when it is being created. */
    id: string | undefined;
    locale: string;
    defaultLocale: string;
}): Promise<Record<string, unknown>> {
    const { repository, values, definitions, id, locale, defaultLocale } = params;
    if (id === undefined || locale === defaultLocale) return values;

    const shared = sharedFieldNames(
        definitions,
        definitions.map((field) => field.name),
        params.translatable
    );
    if (shared.length === 0) return values;

    const source = await repository.get(
        { id, locale: defaultLocale },
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
 * Copies the shared fields an update touched out to the item's other locales.
 * Only the names the caller actually patched are sent: the merged document
 * holds every field, and propagating an untouched one would overwrite them.
 */
export async function propagateSharedFields(params: {
    translatable: FieldPropagator | undefined;
    definitions: readonly Field[];
    isTranslatable: boolean;
    record: { id: string; locale: string };
    fields: JsonObject;
    patchedFieldNames: string[];
}): Promise<void> {
    const { translatable, definitions, record, fields, patchedFieldNames } = params;
    if (!translatable) return;

    const shared = sharedFieldNames(
        definitions,
        patchedFieldNames,
        params.isTranslatable
    );
    if (shared.length === 0) return;

    const values: JsonObject = {};
    for (const name of shared) {
        const value = fields[name];
        if (value !== undefined) values[name] = value;
    }
    await translatable.propagateFields(record.id, record.locale, values);
}
