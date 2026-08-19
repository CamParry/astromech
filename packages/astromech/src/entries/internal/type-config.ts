/**
 * Config-derived helpers shared across entry operations: locale defaulting,
 * title-field + capability lookups, capability assertions, and field-definition
 * resolution. All read the resolved config.
 */

import type { EntryRepository } from '../repository/types';
import type { Capability } from '@/entries/capabilities';
import type { Field } from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/type-ids.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { resolveContentLocale } from '@/utilities/locale';
import { CapabilityError } from '../errors';
import { getEntryRepository } from '../repository/registry';

export function getDefaultLocale(): string {
    // `defaultLocale` is a DISPLAY tag (e.g. `en-GB`) and may not be a content
    // locale that entries are tagged with. The storage layer matches locale
    // EXACTLY, so bridge the display tag down its RFC 4647 fallback chain to an
    // available content locale; fall back to the first configured locale.
    const config = getConfig();
    const locales = config.locales ?? [];
    const requested = config.defaultLocale ?? 'en';
    return resolveContentLocale(requested, locales) ?? locales[0] ?? requested;
}

/** Whether the type carries a title. Unknown types are titled, like the default. */
export function isTitled(typeName: string): boolean {
    return resolveEntryType(getConfig(), typeName)?.titleField !== false;
}

export function isVersioningEnabled(typeName: string): boolean {
    return (
        getEntryRepository(typeName).versions !== undefined &&
        !!resolveEntryType(getConfig(), typeName)?.versioning
    );
}

export function getNonTranslatableFieldNames(
    typeName: string,
    fieldNames: string[]
): string[] {
    const entryType = resolveEntryType(getConfig(), typeName);
    if (!entryType?.translatable) return [];
    const nonTranslatable: string[] = [];
    for (const field of flattenEntryFields(entryType.fields)) {
        if (fieldNames.includes(field.name) && field.translatable === false) {
            nonTranslatable.push(field.name);
        }
    }
    return nonTranslatable;
}

/** Flattened field definitions for an entry type (`[]` if the type is unknown). */
export function resolveTypeFields(typeName: string): Field[] {
    const entryType = resolveEntryType(getConfig(), typeName);
    return entryType ? flattenEntryFields(entryType.fields) : [];
}

/** Enforce a type's configured capability set. */
export function assertCapability(typeName: string, capability: Capability): void {
    const caps = resolveEntryType(getConfig(), typeName)?.capabilities;
    if (caps && !caps[capability]) {
        throw new CapabilityError(typeName, capability);
    }
}

/**
 * Assert the type supports staging (capability + built-in storage, the only
 * backend that carries `stagedFor` in v1) and return both the storage and its
 * (now-narrowed) staging sub-surface.
 */
export function getStagingRepository(typeName: string): {
    repository: EntryRepository;
    staging: NonNullable<EntryRepository['staging']>;
} {
    assertCapability(typeName, 'staging');
    const repository = getEntryRepository(typeName);
    const staging = repository.staging;
    if (!staging) {
        throw new Error(
            `Entry type "${typeName}" does not support staging (built-in storage required).`
        );
    }
    return { repository, staging };
}
