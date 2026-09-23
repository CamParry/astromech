/**
 * The refusal for an operation on an entry type or a global that does not
 * declare the capability it needs. Answers 409 with `capability_not_supported`.
 */

import { ApiError } from '@/errors/api-error';

/** The two kinds that declare capabilities, and how a message names each. */
const LABELS = { entry: 'Entry type', global: 'Global' } as const;

/** Thrown when a target lacks the capability an operation requires. */
export class CapabilityError extends ApiError {
    public readonly kind: keyof typeof LABELS;
    /** The entry type or the global's key. */
    public readonly id: string;
    public readonly capability: string;

    constructor(kind: keyof typeof LABELS, id: string, capability: string) {
        super(`${LABELS[kind]} "${id}" does not support capability: ${capability}`, {
            status: 409,
            code: 'capability_not_supported',
        });
        this.name = 'CapabilityError';
        this.kind = kind;
        this.id = id;
        this.capability = capability;
    }
}
