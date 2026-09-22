/**
 * The service handles a caller cannot exceed — an untrusted transport is
 * handed this instead of the raw domain services, so authority is a property
 * of the handle, not of checks each caller remembered to write. Fails CLOSED.
 */
import type { Permissions } from '@/permissions/permissions-for';
import type {
    EntriesService,
    GlobalsService,
    MediaService,
    NotificationsService,
    PluginServiceNamespace,
    Role,
    ServiceMethodContract,
    SettingsService,
    UsersService,
} from '@/types/index';
import { currentAppContext } from '@/app-context/app-context';
import {
    entriesService,
    globalsService,
    mediaService,
    notificationsService,
    settingsService,
    usersService,
} from '@/app-context/services';
import { entriesDefinition } from '@/entries/service';
import { PermissionDeniedError } from '@/errors/permission';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition } from '@/notifications/service';
import { deniedPermission, resolveAccess } from '@/permissions/access';
import { permissionsFor } from '@/permissions/permissions-for';
import {
    getPluginIdentities,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { settingsDefinition } from '@/settings/service';
import { usersDefinition } from '@/users/service';

/**
 * A domain's contract catalogue, keyed by service method name. Read at
 * `Input = unknown`, the same generality `codegen/method-manifest.ts` uses,
 * since nothing here inspects an input type.
 */
type ContractCatalogue = Record<string, ServiceMethodContract>;

/** Anything callable through a string key. */
type ServiceRecord = Record<string, unknown>;

/** A method as this wrapper calls it: one parameter object, any return. */
type ServiceFn = (...args: unknown[]) => unknown;

/**
 * Refuse a session-scoped call when nobody is signed in, since there is no
 * subject to act as. The handler reads the subject from `ctx.user` itself, so
 * the caller's input needs nothing added to it.
 */
async function requireSubject(id: string): Promise<void> {
    const { user } = await currentAppContext();
    if (user === null) {
        throw new PermissionDeniedError(
            id,
            null,
            'is session-scoped, and this caller has no signed-in user to act as.'
        );
    }
}

/**
 * Wrap every method of `service` in its declared permission check. A denied
 * method still EXISTS on the returned object and throws, rather than
 * disappearing as if it were never there — even for a synchronous method.
 */
export function scopeMethods<S extends object>(
    service: S,
    contracts: ContractCatalogue,
    permissions: Permissions,
    module: string
): S {
    const scoped: ServiceRecord = {};

    for (const [key, value] of Object.entries(service as ServiceRecord)) {
        if (typeof value !== 'function') {
            scoped[key] = value;
            continue;
        }
        const fn = value as ServiceFn;
        const id = `${module}.${key}`;

        scoped[key] = (...args: unknown[]): unknown => {
            const contract = contracts[key];
            if (contract === undefined) throw new PermissionDeniedError(id, null);

            const input = args[0];
            const resolved = resolveAccess(contract.access, input);
            if (!permissions.allowsAccess(resolved)) {
                throw new PermissionDeniedError(
                    id,
                    deniedPermission(resolved, permissions.allows)
                );
            }
            // Called on the service so a method reaching for a sibling through
            // `this` keeps working. Only the session-scoped branch is async,
            // since reading the request context needs an await.
            if (contract.sessionScoped === true) {
                return (async (): Promise<unknown> => {
                    await requireSubject(id);
                    return fn.apply(service, args);
                })();
            }
            return fn.apply(service, args);
        };
    }

    return scoped as S;
}

/** A plugin's methods as the scoped handle exposes them. */
type PluginMethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

/**
 * Wrap every registered plugin's service methods in their declared `access`,
 * resolved under the plugin's permission namespace. A denied method still
 * exists on the returned object and rejects, as `scopeMethods` does.
 */
function scopePlugins(permissions: Permissions): PluginServiceNamespace {
    const scoped: Record<string, PluginMethodMap> = {};

    for (const identity of getPluginIdentities()) {
        const methods = getPluginServiceMethods().get(identity.namespace) ?? {};
        const wrapped: PluginMethodMap = {};

        for (const [key, method] of Object.entries(methods)) {
            const id = `plugins.${identity.serviceKey}.${key}`;

            wrapped[key] = async (input?: unknown): Promise<unknown> => {
                // Decided on the raw input, before the invoker parses it, as
                // `scopeMethods` does for a core method.
                const resolved = resolveAccess(
                    method.access,
                    input,
                    identity.permissionNamespace
                );
                if (!permissions.allowsAccess(resolved)) {
                    throw new PermissionDeniedError(
                        id,
                        deniedPermission(resolved, permissions.allows)
                    );
                }
                const invoke = pluginServices[identity.serviceKey]?.[key];
                if (invoke === undefined) throw new PermissionDeniedError(id, null);
                return invoke(input);
            };
        }

        scoped[identity.serviceKey] = wrapped;
    }

    return scoped as PluginServiceNamespace;
}

/** The domains a caller can reach, each scoped to one role. */
export type ScopedServices = {
    users: UsersService;
    media: MediaService;
    settings: SettingsService;
    entries: EntriesService;
    globals: GlobalsService;
    notifications: NotificationsService;
    plugins: PluginServiceNamespace;
};

/**
 * Compose one role into a handle over every domain.
 *
 * One `permissionsFor` guard backs them all, so the role is resolved once per
 * handle rather than once per call.
 */
export function scopedServices(role: Role | null | undefined): ScopedServices {
    const permissions = permissionsFor(role);
    return {
        users: scopeMethods(
            usersService,
            usersDefinition.catalogue,
            permissions,
            'users'
        ),
        media: scopeMethods(
            mediaService,
            mediaDefinition.catalogue,
            permissions,
            'media'
        ),
        settings: scopeMethods(
            settingsService,
            settingsDefinition.catalogue,
            permissions,
            'settings'
        ),
        // An entry's and a global's permissions depend on the call's `type` or
        // `key`, and each contract states that in the function form, the
        // `full` and publish gates included.
        entries: scopeMethods(
            entriesService,
            entriesDefinition.catalogue,
            permissions,
            'entries'
        ),
        globals: scopeMethods(
            globalsService,
            globalsDefinition.catalogue,
            permissions,
            'globals'
        ),
        notifications: scopeMethods(
            notificationsService,
            notificationsDefinition.catalogue,
            permissions,
            'notifications'
        ),
        plugins: scopePlugins(permissions),
    };
}
