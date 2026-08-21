/**
 * Config-derived helpers shared across entry operations: locale defaulting,
 * title-field + capability lookups, capability assertions, and field-definition
 * resolution. All read the resolved config.
 */

import type { EntryRepository, EntryRow } from '../repository/types';
import type { Capability } from '@/entries/capabilities';
import type { Field } from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/entry-types.shared';
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
export function isTitled(type: string): boolean {
    return resolveEntryType(getConfig(), type)?.titleField !== false;
}

export function isVersioningEnabled(type: string): boolean {
    return (
        getEntryRepository(type).versions !== undefined &&
        !!resolveEntryType(getConfig(), type)?.versioning
    );
}

export function getNonTranslatableFieldNames(
    type: string,
    fieldNames: string[]
): string[] {
    const entryType = resolveEntryType(getConfig(), type);
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
export function resolveTypeFields(type: string): Field[] {
    const entryType = resolveEntryType(getConfig(), type);
    return entryType ? flattenEntryFields(entryType.fields) : [];
}

/** Enforce a type's configured capability set. */
export function assertCapability(type: string, capability: Capability): void {
    const caps = resolveEntryType(getConfig(), type)?.capabilities;
    if (caps && !caps[capability]) {
        throw new CapabilityError(type, capability);
    }
}

/**
 * Assert the type supports trash and return its narrowed `trash` group —
 * the single gate for trash, restore and emptyTrash (replacing a capability
 * assertion plus a separate `if (!repository.trash) throw` in each).
 */
export function requireTrash<R extends EntryRow>(
    repository: EntryRepository<R>,
    type: string
): NonNullable<EntryRepository<R>['trash']> {
    assertCapability(type, 'trash');
    // Guaranteed by the capability check above; the storage groups mirror the
    // type's configured capabilities. The guard narrows for the type system.
    if (!repository.trash) throw new CapabilityError(type, 'trash');
    return repository.trash;
}

/**
 * Assert the type supports staging (capability + built-in storage, the only
 * backend that carries `stagedFor` in v1) and return both the storage and its
 * (now-narrowed) staging sub-surface.
 */
export function requireStaging(type: string): {
    repository: EntryRepository;
    staging: NonNullable<EntryRepository['staging']>;
} {
    assertCapability(type, 'staging');
    const repository = getEntryRepository(type);
    const staging = repository.staging;
    if (!staging) {
        throw new Error(
            `Entry type "${type}" does not support staging (built-in storage required).`
        );
    }
    return { repository, staging };
}
