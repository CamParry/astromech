/**
 * Field-type registry — the single source of truth per field type.
 *
 * Core field types are authored in `./core-field-types` and registered at module
 * load below; the `coerce → default → validate` pipeline dispatches to them.
 */

import type { FieldType } from '@/types/fields';
import { coreFieldTypes } from './core-field-types';

/** Registered field types keyed by field `type`. Populated at module load. */
const fieldTypes = new Map<string, FieldType>();

/** Register (or replace) a field type. */
export function registerFieldType(fieldType: FieldType): void {
    fieldTypes.set(fieldType.type, fieldType);
}

/** Look up the field type for a field `type`, if registered. */
export function getFieldType(type: string): FieldType | undefined {
    return fieldTypes.get(type);
}

for (const f of coreFieldTypes) registerFieldType(f);
