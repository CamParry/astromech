/**
 * Config-derived helpers shared across entry operations: the versioning lookup
 * and the capability assertions. Each reads the resolved config or type, which
 * the caller hands it.
 */

import type { Capability } from '@/entries/capabilities';
import type { ResolvedConfig, ResolvedEntryType } from '@/types/index';
import { assertCapability } from '@/content/capabilities';
import { resolveEntryType } from '@/entries/entry-types';
import { CapabilityError } from '@/errors/capability';
import { getEntryRepository } from '../repository/registry';

/** Whether the type keeps versions and its repository can store them. */
export function isVersioningEnabled(config: ResolvedConfig, type: string): boolean {
    return (
        getEntryRepository(type).versions !== undefined &&
        !!resolveEntryType(config, type)?.versioning
    );
}

/** The type one call's input names, or the empty type when it names none. */
export function typeOf(input: unknown): string {
    if (typeof input !== 'object' || input === null) return '';
    const { type } = input as { type?: unknown };
    return typeof type === 'string' ? type : '';
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
