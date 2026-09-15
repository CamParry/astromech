/**
 * The service handles a caller cannot exceed — an untrusted transport is
 * handed this instead of the raw domain services, so authority is a property
 * of the handle, not of checks each caller remembered to write. Fails CLOSED.
 */
import type { EntryMethodName } from '@/entries/catalogue';
import type { Permissions } from '@/permissions/permissions-for';
import type {
    EntriesService,
    GlobalsService,
    MediaService,
    NotificationsService,
    PluginServiceNamespace,
    Role,
    ServiceMethodAccess,
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
import { resolveAccess } from '@/permissions/access';
import { PERMISSION_ENTRY_READ_FULL } from '@/permissions/core-permissions';
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

/** The permission a contract demands for `input`, or null if it demands none. */
function resolvePermission(
    contract: ServiceMethodContract,
    input: unknown
): string | null {
    const resolved = resolveAccess(contract.access, input);
    return resolved.kind === 'permission' ? resolved.permission : null;
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
            if (!permissions.allowsMethod(contract, input)) {
                throw new PermissionDeniedError(id, resolvePermission(contract, input));
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

/**
 * The entry types one call targets, or null when the call names none.
 * `query` accepts a list (cross-type listing), and a call must hold the
 * permission for EVERY type it touches — not just one in the list.
 */
function targetedTypes(input: unknown): string[] | null {
    if (typeof input !== 'object' || input === null) return null;
    const type = (input as { type?: unknown }).type;

    if (typeof type === 'string') return type.length > 0 ? [type] : null;
    if (!Array.isArray(type) || type.length === 0) return null;
    if (type.some((t) => typeof t !== 'string' || t.length === 0)) return null;
    return type as string[];
}

/**
 * Does this call ask for the full (admin) shape rather than the public one?
 * `full` is a second axis of authority no per-type permission covers, checked
 * for every method so growing the option can't silently grow a bypass.
 */
function wantsFullShape(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    return (input as { full?: unknown }).full === true;
}

/**
 * Scope the entries service: its permission is per (type, action)
 * (`entry:posts:update` ≠ `entry:pages:update`), so the check is the method's
 * own `access` rule resolved once per type the call targets, rather than one
 * fixed contract.
 */
export function scopeEntries(
    service: EntriesService,
    permissions: Permissions
): EntriesService {
    const scoped: ServiceRecord = {};

    for (const [key, value] of Object.entries(service as unknown as ServiceRecord)) {
        if (typeof value !== 'function') {
            scoped[key] = value;
            continue;
        }
        const fn = value as ServiceFn;
        const id = `entries.${key}`;
        const declared = entriesDefinition.catalogue[key as EntryMethodName] as
            | { access: ServiceMethodAccess<never> }
            | undefined;

        scoped[key] = (...args: unknown[]): unknown => {
            if (declared === undefined) throw new PermissionDeniedError(id, null);

            const types = targetedTypes(args[0]);
            if (types === null) {
                throw new PermissionDeniedError(
                    id,
                    null,
                    'was called without an entry type, so the permission it needs cannot be derived.'
                );
            }

            for (const type of types) {
                // The rule reads `type` off the input, so a cross-type call is
                // resolved once per type rather than once for the list.
                const resolved = resolveAccess(declared.access, {
                    ...(args[0] as object),
                    type,
                });
                if (resolved.kind !== 'permission') continue;
                if (!permissions.allows(resolved.permission)) {
                    throw new PermissionDeniedError(id, resolved.permission);
                }
            }

            if (
                wantsFullShape(args[0]) &&
                !permissions.allows(PERMISSION_ENTRY_READ_FULL)
            ) {
                throw new PermissionDeniedError(id, PERMISSION_ENTRY_READ_FULL);
            }

            return fn.apply(service, args);
        };
    }

    return scoped as unknown as EntriesService;
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
                        resolved.kind === 'permission' ? resolved.permission : null
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
        entries: scopeEntries(entriesService, permissions),
        // Plain `scopeMethods`: a global's permission depends on the `key` in
        // the call, and its contract says so in the function form — including
        // the `full`/`staged` gate `scopeEntries` has to apply by hand.
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
