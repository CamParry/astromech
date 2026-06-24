/**
 * Config-derived helpers shared across entry operations: locale defaulting,
 * title-field + capability lookups, and field-definition resolution. All read
 * the resolved `virtual:astromech/config`.
 */

import config from 'virtual:astromech/config';
import { resolveContentLocale } from '@/utilities/locale.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { resolveEntryType } from '../type-registry.js';
import { getEntryStorage } from '../storage/registry.js';
import type { Entry, FieldDefinition } from '@/types/index.js';

export function getDefaultLocale(): string {
    // `defaultLocale` is a DISPLAY tag (e.g. `en-GB`) and may not be a content
    // locale that entries are tagged with. The storage layer matches locale
    // EXACTLY, so bridge the display tag down its RFC 4647 fallback chain to an
    // available content locale; fall back to the first configured locale.
    const cfg = config as { defaultLocale?: string; locales?: readonly string[] };
    const locales = cfg.locales ?? [];
    const requested = cfg.defaultLocale ?? 'en';
    return resolveContentLocale(requested, locales) ?? locales[0] ?? requested;
}

export function getTitleField(typeName: string): 'title' | false {
    return resolveEntryType(config, typeName)?.titleField ?? 'title';
}

export function isVersioningEnabled(typeName: string): boolean {
    return (
        getEntryStorage(typeName).versions !== undefined &&
        !!resolveEntryType(config, typeName)?.versioning
    );
}

export function getNonTranslatableFieldNames(
    typeName: string,
    fieldNames: string[]
): string[] {
    const entryTypeConfig = resolveEntryType(config, typeName);
    if (!entryTypeConfig?.translatable) return [];
    const nonTranslatable: string[] = [];
    for (const field of flattenEntryFields(entryTypeConfig.fields)) {
        if (fieldNames.includes(field.name) && field.translatable === false) {
            nonTranslatable.push(field.name);
        }
    }
    return nonTranslatable;
}

/** Flattened field definitions for an entry type (`[]` if the type is unknown). */
export function resolveTypeFields(typeName: string): FieldDefinition[] {
    const cfg = resolveEntryType(config, typeName);
    return cfg ? flattenEntryFields(cfg.fields) : [];
}

/** Field definitions for a (possibly related) entry, resolved by its own type. */
export function resolveRelatedFields(related: Entry): FieldDefinition[] {
    return resolveTypeFields(related.type);
}
