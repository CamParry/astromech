/**
 * Config-derived helpers shared across entry operations: the versioning lookup
 * and the capability assertion. Both read the resolved config, which the
 * caller hands them.
 */

import type { Capability } from '@/entries/capabilities';
import type { ResolvedConfig } from '@/types/index';
import { resolveEntryType } from '@/entries/entry-types';
import { CapabilityError } from '../errors';
import { getEntryRepository } from '../repository/registry';

/** Whether the type keeps versions and its repository can store them. */
export function isVersioningEnabled(config: ResolvedConfig, type: string): boolean {
    return (
        getEntryRepository(type).versions !== undefined &&
        !!resolveEntryType(config, type)?.versioning
    );
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
