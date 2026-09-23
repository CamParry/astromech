/** The capability check an entry type and a global share. */

import { CapabilityError } from '@/errors/capability';

/** A target that declares capabilities: a resolved entry type or global. */
type CapabilityTarget = { id: string; capabilities: Readonly<Record<string, boolean>> };

/** Refuse an operation the target does not declare the capability for. */
export function assertCapability(
    kind: 'entry' | 'global',
    target: CapabilityTarget,
    capability: string
): void {
    if (target.capabilities[capability] !== true) {
        throw new CapabilityError(kind, target.id, capability);
    }
}
