/**
 * Config-derived helpers shared across entry operations: locale defaulting,
 * title-field + capability lookups, capability assertions, and field-definition
 * resolution. All read the resolved config.
 */

import type { Capability } from '@/entries/capabilities';
import type { Field, ResolvedEntryType } from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { resolveContentLocale } from '@/utilities/locale';
import { CapabilityError } from '../errors';
import { getEntryRepository } from '../repository/registry';

/**
 * The content locale entries are tagged with by default, reached by walking
 * `defaultLocale` down its RFC 4647 fallback chain.
 */
export function getDefaultContentLocale(): string {
    // `defaultLocale` is a display tag (e.g. `en-GB`) and the repository matches
    // locale exactly, so fall back to the first configured locale.
    const config = getConfig();
    const locales = config.locales ?? [];
    const requested = config.defaultLocale ?? 'en';
    return resolveContentLocale(requested, locales) ?? locales[0] ?? requested;
}

/** Whether the type carries a title. Unknown types are titled, like the default. */
export function isTitled(type: string): boolean {
    return resolveType(type)?.titleField !== false;
}

/** Whether the type keeps versions and its repository can store them. */
export function isVersioningEnabled(type: string): boolean {
    return (
        getEntryRepository(type).versions !== undefined && !!resolveType(type)?.versioning
    );
}

/** Flattened field definitions for an entry type (`[]` if the type is unknown). */
export function resolveTypeFields(type: string): Field[] {
    const entryType = resolveType(type);
    return entryType ? flattenEntryFields(entryType.fields) : [];
}

/** Enforce a type's configured capability set. */
export function assertCapability(type: string, capability: Capability): void {
    const capabilities = resolveType(type)?.capabilities;
    if (capabilities && !capabilities[capability]) {
        throw new CapabilityError(type, capability);
    }
}

function resolveType(type: string): ResolvedEntryType | undefined {
    return resolveEntryType(getConfig(), type);
}
