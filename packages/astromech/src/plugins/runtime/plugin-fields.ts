/**
 * Plugin custom field types.
 *
 * Collects `fields: [...]` registrations across the plugin set and guards
 * against collisions — with core field types and between plugins. Validation
 * runs at config resolution (crash-loud); the collected map feeds the
 * type generator and the `virtual:astromech/plugins/components` code-gen.
 */

import type { PluginDefinition, PluginFieldTypeRegistration } from '@/types/index.js';
import { CORE_FIELD_TYPES } from '@/types/index.js';

/**
 * Collect all plugin field-type registrations, keyed by field type.
 * Assumes `assertNoFieldTypeCollisions` has already passed.
 */
export function collectPluginFieldTypes(
    defs: PluginDefinition[]
): Map<string, PluginFieldTypeRegistration> {
    const registrations = new Map<string, PluginFieldTypeRegistration>();
    for (const def of defs) {
        for (const registration of def.fields ?? []) {
            registrations.set(registration.type, registration);
        }
    }
    return registrations;
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
