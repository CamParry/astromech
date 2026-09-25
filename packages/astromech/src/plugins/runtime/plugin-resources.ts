/**
 * Plugin admin resources: the config-time check of each resource against the
 * plugin's service, and the admin config form with every permission resolved.
 */

import type {
    AdminResource,
    PluginDefinition,
    ResolvedAdminResource,
    ResolvedAdminResourceMethod,
    ResolvedPluginIdentity,
} from '@/types/index';
import { flattenFieldNodes } from '@/fields/flatten';
import { resolvePluginPermission } from './plugin-identity';

/** A resource name is one URL segment: lowercase words joined by `-`. */
const RESOURCE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type MethodRole = keyof AdminResource['methods'];

const OPTIONAL_METHOD_ROLES = ['get', 'create', 'update', 'delete'] as const;

const METHOD_ROLES: readonly MethodRole[] = ['list', ...OPTIONAL_METHOD_ROLES];

/**
 * Throw when a plugin's admin resource names a method its service lacks, names
 * one without `access: { permission }`, repeats a name, or lists a column that
 * is not one of its top-level data fields.
 */
export function assertAdminResourcesValid(plugins: PluginDefinition[]): void {
    for (const def of plugins) {
        const seen = new Set<string>();
        for (const resource of def.admin?.resources ?? []) {
            const where = describeResource(def, resource);

            if (!RESOURCE_NAME_PATTERN.test(resource.name)) {
                throw new Error(
                    `${where}: a name is lowercase letters and digits joined by "-", ` +
                        `since it is the resource's URL segment.`
                );
            }
            if (seen.has(resource.name)) {
                throw new Error(
                    `${where}: the name is declared twice. Every name is unique.`
                );
            }
            seen.add(resource.name);

            for (const role of METHOD_ROLES) {
                const name = resource.methods[role];
                if (name !== undefined) declaredPermission(def, resource, role, name);
            }

            const fieldNames = new Set(
                flattenFieldNodes(resource.fields).map((field) => field.name)
            );
            for (const column of resource.columns) {
                const field = typeof column === 'string' ? column : column.field;
                if (!fieldNames.has(field)) {
                    throw new Error(
                        `${where}: the column "${field}" is not a top-level data field ` +
                            `of the resource's \`fields\`.`
                    );
                }
            }
        }
    }
}

/**
 * A plugin's admin resources as the admin config carries them, each method's
 * permission resolved under the plugin's namespace.
 */
export function resolveAdminResources(
    identity: ResolvedPluginIdentity,
    def: PluginDefinition
): ResolvedAdminResource[] {
    return (def.admin?.resources ?? []).map((resource) => {
        const resolve = (role: MethodRole, name: string) =>
            resolveResourceMethod(identity, def, resource, role, name);
        const methods: ResolvedAdminResource['methods'] = {
            list: resolve('list', resource.methods.list),
        };
        for (const role of OPTIONAL_METHOD_ROLES) {
            const name = resource.methods[role];
            if (name !== undefined) methods[role] = resolve(role, name);
        }

        return {
            name: resource.name,
            label: resource.label,
            labelSingular: resource.labelSingular,
            ...(resource.icon !== undefined ? { icon: resource.icon } : {}),
            fields: resource.fields,
            columns: resource.columns.map((column) =>
                typeof column === 'string'
                    ? { field: column, sortable: false }
                    : { field: column.field, sortable: column.sortable === true }
            ),
            search: resource.search === true,
            methods,
        };
    });
}

/** One of a resource's methods, with the permission it declares resolved under the plugin's namespace. */
export function resolveResourceMethod(
    identity: ResolvedPluginIdentity,
    def: PluginDefinition,
    resource: AdminResource,
    role: MethodRole,
    name: string
): ResolvedAdminResourceMethod {
    return {
        name,
        permission: resolvePluginPermission(
            identity.permissionNamespace,
            declaredPermission(def, resource, role, name)
        ),
    };
}

/**
 * The permission the named service method declares. Throws when the service has
 * no such method, or the method declares no `access: { permission }`.
 */
function declaredPermission(
    def: PluginDefinition,
    resource: AdminResource,
    role: MethodRole,
    name: string
): string {
    const where = describeResource(def, resource);
    const method = Object.hasOwn(def.service ?? {}, name)
        ? def.service?.[name]
        : undefined;
    if (method === undefined) {
        throw new Error(
            `${where}: its ${role} method "${name}" is not a method of the plugin's \`service\`.`
        );
    }
    if (typeof method.access !== 'object') {
        throw new Error(
            `${where}: its ${role} method "${name}" must declare \`access: { permission }\`, ` +
                `so the admin knows which permission shows the view.`
        );
    }
    return method.access.permission;
}

function describeResource(def: PluginDefinition, resource: AdminResource): string {
    return `Astromech plugin "${def.package}" admin resource "${resource.name}"`;
}
