/**
 * The service handles a caller cannot exceed — an untrusted transport is
 * handed this instead of the raw domain services, so authority is a property
 * of the handle, not of checks each caller remembered to write. Fails CLOSED.
 */
import type { EntryMethodName } from '@/entries/methods';
import type { NotificationsDomainService } from '@/notifications/service';
import type { EntryAction } from '@/permissions/entry-permission';
import type { Permissions } from '@/permissions/permissions-for';
import type {
    EntriesService,
    GlobalsService,
    MediaService,
    Role,
    ServiceMethodContract,
    SettingsService,
    UsersService,
} from '@/types/index';
import { ENTRY_METHOD_ACTIONS } from '@/entries/methods';
import { entriesService } from '@/entries/service';
import { PermissionDeniedError } from '@/errors/permission';
import { globalsContract } from '@/globals/contract';
import { globalsService } from '@/globals/service';
import { mediaContract } from '@/media/contract';
import { mediaService } from '@/media/service';
import { notificationsContract } from '@/notifications/contract';
import { notificationsService } from '@/notifications/service';
import { resolveAccess } from '@/permissions/access';
import { PERMISSION_ENTRY_READ_FULL } from '@/permissions/core-permissions';
import { entryPermission } from '@/permissions/entry-permission';
import { permissionsFor } from '@/permissions/permissions-for';
import { getCurrentUser } from '@/request-context/request-context';
import { settingsContract } from '@/settings/contract';
import { settingsService } from '@/settings/service';
import { usersContract } from '@/users/contract';
import { usersService } from '@/users/service';

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
 * The input a session-scoped method is called with: the caller's own
 * `userId`, pinned LAST so a caller-supplied one is overwritten. Refused
 * outright when nobody is signed in, since there is no subject to act as.
 */
async function sessionInput(
    id: string,
    input: unknown
): Promise<Record<string, unknown>> {
    const user = await getCurrentUser();
    if (user === null) {
        throw new PermissionDeniedError(
            id,
            null,
            'is session-scoped, and this caller has no signed-in user to act as.'
        );
    }
    const base = typeof input === 'object' && input !== null ? input : {};
    return { ...base, userId: user.id };
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
            // since resolving the subject needs an await.
            if (contract.sessionScoped === true) {
                return (async (): Promise<unknown> =>
                    fn.apply(service, [await sessionInput(id, input)]))();
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
 * (`entry:posts:update` ≠ `entry:pages:update`), read from
 * `ENTRY_METHOD_ACTIONS`, so the check cannot come from a fixed contract.
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
        const action: EntryAction | undefined =
            ENTRY_METHOD_ACTIONS[key as EntryMethodName];

        scoped[key] = (...args: unknown[]): unknown => {
            if (action === undefined) throw new PermissionDeniedError(id, null);

            const types = targetedTypes(args[0]);
            if (types === null) {
                throw new PermissionDeniedError(
                    id,
                    null,
                    'was called without an entry type, so the permission it needs cannot be derived.'
                );
            }

            for (const type of types) {
                const permission = entryPermission(type, action);
                if (!permissions.allows(permission)) {
                    throw new PermissionDeniedError(id, permission);
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

/**
 * The domains a caller can reach, each scoped to one role.
 *
 * `notifications` is the domain shape, not the client's `NotificationsService`:
 * its methods name the `userId` they act for, and this handle is what fills it.
 */
export type ScopedServices = {
    users: UsersService;
    media: MediaService;
    settings: SettingsService;
    entries: EntriesService;
    globals: GlobalsService;
    notifications: NotificationsDomainService;
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
        users: scopeMethods(usersService, usersContract, permissions, 'users'),
        media: scopeMethods(mediaService, mediaContract, permissions, 'media'),
        settings: scopeMethods(
            settingsService,
            settingsContract,
            permissions,
            'settings'
        ),
        entries: scopeEntries(entriesService, permissions),
        // Plain `scopeMethods`: a global's permission depends on the `key` in
        // the call, and its contract says so in the function form — including
        // the `full`/`staged` gate `scopeEntries` has to apply by hand.
        globals: scopeMethods(globalsService, globalsContract, permissions, 'globals'),
        notifications: scopeMethods(
            notificationsService,
            notificationsContract,
            permissions,
            'notifications'
        ),
    };
}
