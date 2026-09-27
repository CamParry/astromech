/**
 * The capability vocabulary an entry type turns on or off, and a method's
 * `requires` names, with the checks that hold a call or a payload to it.
 */

import type { ResolvedConfig, ResolvedEntryType } from '@/types/index';
import { assertCapability } from '@/content/capabilities';
import { resolveEntryType } from '@/entries/entry-types';
import { CapabilityError } from '@/errors/capability';

export type Capability =
    | 'statuses'
    | 'slug'
    | 'translatable'
    | 'versioning'
    | 'trash'
    | 'staging';

/** Every capability. */
const ALL_CAPABILITIES: readonly Capability[] = [
    'statuses',
    'slug',
    'translatable',
    'versioning',
    'trash',
    'staging',
];

/** Whether a string names a capability, since a method's `requires` is typed `string`. */
export function isCapability(value: string): value is Capability {
    return (ALL_CAPABILITIES as readonly string[]).includes(value);
}

/** Enforce a type's configured capability set. An unknown type is left to the caller. */
export function assertTypeCapability(
    config: ResolvedConfig,
    type: string,
    capability: Capability
): void {
    const entryType = resolveEntryType(config, type);
    if (entryType) assertCapability('entry', entryType, capability);
}

/**
 * Refuse a write payload naming a column the type does not keep: `status` and
 * `publishedAt` need `statuses`, and `slug` needs `slug`.
 */
export function assertWritableFields(
    entryType: ResolvedEntryType,
    data: { status?: unknown; publishedAt?: unknown; slug?: unknown }
): void {
    const { capabilities } = entryType;
    if (
        !capabilities.statuses &&
        (data.status !== undefined || data.publishedAt !== undefined)
    ) {
        throw new CapabilityError('entry', entryType.id, 'statuses');
    }
    if (!capabilities.slug && data.slug !== undefined) {
        throw new CapabilityError('entry', entryType.id, 'slug');
    }
}
