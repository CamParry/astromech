/**
 * Plugin field types: guards against collisions, with core types and between
 * plugins, and hands the set to the field-type registry when the config
 * resolves.
 */

import type { FieldType, PluginDefinition } from '@/types/index';
import { CORE_FIELD_TYPES } from '@/types/index';

/**
 * Every plugin's field types as `FieldType`s, without the admin component,
 * which only the admin's component map reads. Assumes
 * `assertNoFieldTypeCollisions` has already passed.
 */
export function pluginFieldTypes(defs: PluginDefinition[]): FieldType[] {
    return defs.flatMap((def) =>
        (def.fields ?? []).map(({ component: _component, ...fieldType }) => fieldType)
    );
}

/**
 * Throw a build error when a plugin field type shadows a core type or is
 * registered by two plugins.
 */
export function assertNoFieldTypeCollisions(defs: PluginDefinition[]): void {
    const coreTypes = new Set<string>(CORE_FIELD_TYPES);
    const seen = new Map<string, string>();

    for (const def of defs) {
        for (const registration of def.fields ?? []) {
            if (coreTypes.has(registration.type)) {
                throw new Error(
                    `Astromech plugin "${def.package}" registers field type "${registration.type}", ` +
                        `which is a core field type. Pick a different type key.`
                );
            }
            const existing = seen.get(registration.type);
            if (existing !== undefined && existing !== def.package) {
                throw new Error(
                    `Astromech plugin field-type collision: "${registration.type}" is registered ` +
                        `by both "${existing}" and "${def.package}".`
                );
            }
            seen.set(registration.type, def.package);
        }
    }
}
