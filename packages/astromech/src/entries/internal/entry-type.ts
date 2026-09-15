/**
 * Config-derived helpers shared across entry operations: title-field and
 * capability lookups, capability assertions, and field-definition resolution.
 * All read the resolved config, which the caller hands them.
 */

import type { Capability } from '@/entries/capabilities';
import type { Field, ResolvedConfig } from '@/types/index';
import { resolveEntryType } from '@/entries/entry-types';
import { flattenEntryFields } from '@/fields/flatten';
import { CapabilityError } from '../errors';
import { getEntryRepository } from '../repository/registry';

/** Whether the type carries a title. Unknown types are titled, like the default. */
export function isTitled(config: ResolvedConfig, type: string): boolean {
    return resolveEntryType(config, type)?.titleField !== false;
}

/** Whether the type keeps versions and its repository can store them. */
export function isVersioningEnabled(config: ResolvedConfig, type: string): boolean {
    return (
        getEntryRepository(type).versions !== undefined &&
        !!resolveEntryType(config, type)?.versioning
    );
}

/** Flattened field definitions for an entry type (`[]` if the type is unknown). */
export function resolveTypeFields(config: ResolvedConfig, type: string): Field[] {
    const entryType = resolveEntryType(config, type);
    return entryType ? flattenEntryFields(entryType.fields) : [];
}

/** Enforce a type's configured capability set. */
export function assertCapability(
    config: ResolvedConfig,
    type: string,
    capability: Capability
): void {
    const capabilities = resolveEntryType(config, type)?.capabilities;
    if (capabilities && !capabilities[capability]) {
        throw new CapabilityError(type, capability);
    }
}
