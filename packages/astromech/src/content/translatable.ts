/**
 * Non-translatable fields belong to the item, not to one of its locales: they
 * are inherited from the default-locale row when a translation is written, and
 * propagated to the other locales when the default one is updated.
 */

import type { ContentRef, ContentRow } from './repository/types';
import type { ResourceSpec } from './resources';
import type { DataField } from '@/types/fields';
import type { JsonObject, ResolvedConfig } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { flattenFieldNodes } from '@/fields/flatten';

/** The read `inheritSharedFields` needs: one locale of one item. */
type ContentReader = {
    findOne(
        ref: ContentRef,
        opts?: { includeTrashed?: boolean }
    ): Promise<Pick<ContentRow, 'fields'> | null>;
};

/** The write `propagateSharedFields` needs. */
type FieldPropagator = {
    propagateFields(id: string, excludeLocale: string, values: JsonObject): Promise<void>;
};

/**
 * Merges the item's shared fields in from its default-locale row. A field
 * marked `translatable: false` belongs to the item, so a new translation takes
 * the stored value over whatever the caller sent.
 */
export async function inheritSharedFields(
    spec: ResourceSpec,
    config: ResolvedConfig,
    params: {
        /** The entry type or global key; users and media have none. */
        target?: string | undefined;
        repository: ContentReader;
        values: Record<string, unknown>;
        /** The item being translated; absent when it is being created. */
        id: string | undefined;
        locale: string;
    }
): Promise<Record<string, unknown>> {
    const { repository, values, id, locale } = params;
    const defaultLocale = defaultContentLocale(config);
    if (id === undefined || locale === defaultLocale) return values;

    const shared = sharedFieldNames(spec, config, params.target, undefined);
    if (shared.length === 0) return values;

    const source = await repository.findOne(
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
export async function propagateSharedFields(
    spec: ResourceSpec,
    config: ResolvedConfig,
    params: {
        target?: string | undefined;
        translatable: FieldPropagator | undefined;
        record: { id: string; locale: string };
        fields: JsonObject;
        patchedFieldNames: string[];
    }
): Promise<void> {
    const { translatable, record, fields } = params;
    if (!translatable) return;

    const shared = sharedFieldNames(
        spec,
        config,
        params.target,
        params.patchedFieldNames
    );
    if (shared.length === 0) return;

    const values: JsonObject = {};
    for (const name of shared) {
        const value = fields[name];
        if (value !== undefined) values[name] = value;
    }
    await translatable.propagateFields(record.id, record.locale, values);
}

/**
 * The target's fields marked `translatable: false`, narrowed to `names` when
 * given. Empty when the target itself is not translatable.
 */
function sharedFieldNames(
    spec: ResourceSpec,
    config: ResolvedConfig,
    target: string | undefined,
    names: readonly string[] | undefined
): string[] {
    if (!spec.translatable(config, target)) return [];
    const definitions: DataField[] = flattenFieldNodes(spec.fields(config, target));
    return definitions
        .filter(
            (field) =>
                field.translatable === false &&
                (names === undefined || names.includes(field.name))
        )
        .map((field) => field.name);
}
