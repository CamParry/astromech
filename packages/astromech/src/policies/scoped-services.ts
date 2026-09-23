/**
 * The service handles a caller cannot exceed — an untrusted transport is
 * handed this instead of the raw domain services, so authority is a property
 * of the handle, not of checks each caller remembered to write. Fails CLOSED.
 */
import type { Permissions } from '@/permissions/permissions-for';
import type {
    AppContext,
    EntriesService,
    GlobalsService,
    MediaService,
    NotificationsService,
    PluginServiceNamespace,
    ServiceMethodContract,
    User,
    UsersService,
} from '@/types/index';
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
import { pluginServicesFor } from '@/plugins/runtime/plugin-services';
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

/** Who a scoped handle acts for: the role's guard, and the signed-in user if any. */
export type ScopedCaller = { permissions: Permissions; user: User | null };

/**
 * Wrap every method of `service` in its declared permission check. A denied
 * method still EXISTS on the returned object and throws, rather than
 * disappearing as if it were never there. A session-scoped method is refused
 * when `caller` has no signed-in user, since there is no subject to act as.
 */
export function scopeMethods<S extends object>(
    service: S,
    contracts: ContractCatalogue,
    caller: ScopedCaller,
    module: string
): S {
    const { permissions } = caller;
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
            if (contract.sessionScoped === true && caller.user === null) {
                throw new PermissionDeniedError(
                    id,
                    null,
                    'is session-scoped, and this caller has no signed-in user to act as.'
                );
            }
            // Called on the service so a method reaching for a sibling through
            // `this` keeps working.
            return fn.apply(service, args);
        };
    }

    return scoped as S;
}

/** A plugin's methods as the scoped handle exposes them. */
type PluginMethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

/**
 * Wrap every registered plugin's service methods in their declared `access`,
 * resolved under the plugin's permission namespace, each running as `ctx`. A
 * denied method still exists on the returned object and rejects.
 */
function scopePlugins(ctx: AppContext, permissions: Permissions): PluginServiceNamespace {
    const services = pluginServicesFor(ctx);
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
                const invoke = services[identity.serviceKey]?.[key];
                if (invoke === undefined) throw new PermissionDeniedError(id, null);
                return invoke(input);
            };
        }

        scoped[identity.serviceKey] = wrapped;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- a plugin augments `PluginServiceNamespace`, and in its program `scoped` is not one
    return scoped as PluginServiceNamespace;
}

/** The domains a caller can reach, each scoped to one role. */
export type ScopedServices = {
    users: UsersService;
    media: MediaService;
    entries: EntriesService;
    globals: GlobalsService;
    notifications: NotificationsService;
    plugins: PluginServiceNamespace;
};

const HANDLES = new WeakMap<AppContext, ScopedServices>();

/**
 * The handle over every domain for `ctx`: its services, each method refused
 * unless `ctx.role` may call it. Built once per context and reused.
 */
export function scopedServices(ctx: AppContext): ScopedServices {
    const existing = HANDLES.get(ctx);
    if (existing) return existing;

    const caller: ScopedCaller = {
        permissions: permissionsFor(ctx.role),
        user: ctx.user,
    };
    const handle: ScopedServices = {
        users: scopeMethods(ctx.users, usersDefinition.catalogue, caller, 'users'),
        media: scopeMethods(ctx.media, mediaDefinition.catalogue, caller, 'media'),
        // An entry's and a global's permissions depend on the call's `type` or
        // `key`, and each contract states that in the function form, the
        // `full` and publish gates included.
        entries: scopeMethods(
            ctx.entries,
            entriesDefinition.catalogue,
            caller,
            'entries'
        ),
        globals: scopeMethods(
            ctx.globals,
            globalsDefinition.catalogue,
            caller,
            'globals'
        ),
        notifications: scopeMethods(
            ctx.notifications,
            notificationsDefinition.catalogue,
            caller,
            'notifications'
        ),
        plugins: scopePlugins(ctx, caller.permissions),
    };
    HANDLES.set(ctx, handle);
    return handle;
}
