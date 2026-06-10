import type { Capability } from '@/core/entry-storage/capabilities.js';

/**
 * Thrown when a route or orchestrator operation is attempted on an entry type
 * that does not support the required capability. See Phase 2 spec §API gating.
 */
export class CapabilityError extends Error {
    public readonly capability: Capability;
    public readonly entryType: string;

    constructor(entryType: string, capability: Capability) {
        super(`Entry type "${entryType}" does not support capability: ${capability}`);
        this.name = 'CapabilityError';
        this.capability = capability;
        this.entryType = entryType;
    }
}
