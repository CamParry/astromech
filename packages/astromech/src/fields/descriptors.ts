/**
 * Field-type descriptor registry — the single source of truth per field type.
 *
 * P1a: core descriptors are now authored in `./core-descriptors` and registered
 * at module load below. The `coerce → default → validate` pipeline that dispatches
 * to them arrives in P2. See specs/field-system-and-validation.md §4.3.
 */

import type { FieldTypeDescriptor } from '@/types/fields.js';
import { coreFieldTypeDescriptors } from './core-descriptors.js';

/** Registered descriptors keyed by field `type`. Populated at module load (P1a). */
const descriptors = new Map<string, FieldTypeDescriptor>();

/** Register (or replace) a field-type descriptor. */
export function registerFieldTypeDescriptor(descriptor: FieldTypeDescriptor): void {
    descriptors.set(descriptor.type, descriptor);
}

/** Look up the descriptor for a field `type`, if registered. */
export function getFieldTypeDescriptor(type: string): FieldTypeDescriptor | undefined {
    return descriptors.get(type);
}

for (const d of coreFieldTypeDescriptors) registerFieldTypeDescriptor(d);
