/**
 * Config-derived helpers shared across entry operations: title-field and
 * capability lookups, capability assertions, and field-definition resolution.
 * All read the resolved config.
 */

import type { Capability } from '@/entries/capabilities';
import type { Field, ResolvedEntryType } from '@/types/index';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { CapabilityError } from '../errors';
import { getEntryRepository } from '../repository/registry';

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
