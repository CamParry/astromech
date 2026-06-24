/**
 * Capability gating (entries policy). `assertCapability` enforces a type's
 * configured capability set; `getStagingStorage` additionally narrows to the
 * staging sub-surface (built-in storage only in v1).
 */

import config from 'virtual:astromech/config';
import { resolveEntryType } from '../type-registry.js';
import { getEntryStorage } from '../storage/registry.js';
import { CapabilityError } from '../errors.js';
import type { Capability } from '../storage/capabilities.js';
import type { EntryStorage } from '../storage/types.js';

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
