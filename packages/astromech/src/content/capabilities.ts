/** The capability check an entry type and a global share. */

import { CapabilityError } from '@/errors/capability';

/** A target that declares capabilities: a resolved entry type or global. */
type CapabilityTarget = { id: string; capabilities: Readonly<Record<string, boolean>> };

/**
 * Whether the target declares `capability`, the one a method `requires`. A
 * method that requires none is available on every target.
 */
export function declaresCapability(
    target: Pick<CapabilityTarget, 'capabilities'>,
    capability: string | undefined
): boolean {
    return capability === undefined || target.capabilities[capability] === true;
}

/** Refuse an operation the target does not declare the capability for. */
export function assertCapability(
    kind: 'entry' | 'global',
    target: CapabilityTarget,
    capability: string
): void {
    if (!declaresCapability(target, capability)) {
        throw new CapabilityError(kind, target.id, capability);
    }
}
