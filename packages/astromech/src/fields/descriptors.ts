/**
 * Field-type descriptor registry — the single source of truth per field type.
 *
 * STUB (P0): only the registry plumbing exists. Per-core-type descriptors are
 * authored in P1, and the `coerce → default → validate` pipeline that dispatches
 * to them in P2. See specs/field-system-and-validation.md §4.3.
 */

import type { FieldTypeDescriptor } from '@/types/fields.js';

/** Registered descriptors keyed by field `type`. Populated in P1. */
const descriptors = new Map<string, FieldTypeDescriptor>();

/** Register (or replace) a field-type descriptor. */
export function registerFieldTypeDescriptor(descriptor: FieldTypeDescriptor): void {
    descriptors.set(descriptor.type, descriptor);
}

/** Look up the descriptor for a field `type`, if registered. */
export function getFieldTypeDescriptor(type: string): FieldTypeDescriptor | undefined {
    return descriptors.get(type);
}
