/** What an entry type's or a global's methods demand, for the permission catalogue. */

import type { Permission, ServiceMethodContract } from '@/types/index';
import { declaresCapability } from '@/content/capabilities';
import { resolveAccess } from '@/permissions/access';

/**
 * The permissions `methods` demand of a call with `input`, each named once,
 * leaving out every method whose `requires` the target does not declare.
 */
export function availableMethodPermissions(
    target: { capabilities: Readonly<Record<string, boolean>> },
    methods: Iterable<ServiceMethodContract>,
    input: unknown
): Permission[] {
    const permissions = new Set<Permission>();
    for (const method of methods) {
        if (!declaresCapability(target, method.requires)) continue;
        const resolved = resolveAccess(method.access, input);
        if (resolved.kind !== 'permission') continue;
        for (const permission of resolved.permissions) permissions.add(permission);
    }
    return [...permissions];
}
