/**
 * Config-derived helpers shared across entry operations: locale defaulting,
 * title-field + capability lookups, capability assertions, and field-definition
 * resolution. All read the resolved `virtual:astromech/config`.
 */

import config from 'virtual:astromech/config';
import { resolveContentLocale } from '@/utilities/locale.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { resolveEntryType } from '../type-ids.js';
import { getEntryStorage } from '../storage/registry.js';
import { CapabilityError } from '../errors.js';
import type { Capability } from '../storage/capabilities.js';
import type { EntryStorage } from '../storage/types.js';
import type { FieldDefinition } from '@/types/index.js';

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

/** Enforce a type's configured capability set. */
export function assertCapability(typeName: string, capability: Capability): void {
    const caps = resolveEntryType(config, typeName)?.capabilities;
    if (caps && !caps[capability]) {
        throw new CapabilityError(typeName, capability);
    }
}

/**
 * Assert the type supports staging (capability + built-in storage, the only
 * backend that carries `stagedFor` in v1) and return both the storage and its
 * (now-narrowed) staging sub-surface.
 */
export function getStagingStorage(typeName: string): {
    storage: EntryStorage;
    staging: NonNullable<EntryStorage['staging']>;
} {
    assertCapability(typeName, 'staging');
    const storage = getEntryStorage(typeName);
    const staging = storage.staging;
    if (!staging) {
        throw new Error(
            `Entry type "${typeName}" does not support staging (built-in storage required).`
        );
    }
    return { storage, staging };
}
