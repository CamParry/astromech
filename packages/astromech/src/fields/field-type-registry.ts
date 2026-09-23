/**
 * Field-type registry — one `FieldType` per type name. Core types are fixed at
 * module load; plugin types are set when the config resolves and live on the
 * shared namespace, so every loaded copy of core sees them.
 */

import type { FieldType } from '@/types/fields';
import { createKeyedRegistry } from '@/registry';
import { coreFieldTypes } from './core-field-types';

/** Core field types keyed by `type`. Identical in every loaded copy of core. */
const coreTypes = new Map<string, FieldType>(coreFieldTypes.map((f) => [f.type, f]));

const pluginTypes = createKeyedRegistry<FieldType>('pluginFieldTypes');

/** Replace the plugin field types with this set. Collisions are checked before. */
export function setPluginFieldTypes(fieldTypes: readonly FieldType[]): void {
    pluginTypes.clear();
    for (const fieldType of fieldTypes) pluginTypes.set(fieldType.type, fieldType);
}

/** The field type for a field `type`, core or plugin, if registered. */
export function getFieldType(type: string): FieldType | undefined {
    return coreTypes.get(type) ?? pluginTypes.get(type) ?? undefined;
}
