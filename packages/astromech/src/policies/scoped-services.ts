/**
 * `scopedServices(role)` — the service handles a caller cannot exceed.
 *
 * This is what an untrusted transport (a remote/agent tool-loop, anything acting
 * under a role) is handed INSTEAD of the raw domain services. Every
 * method on the handle checks its own contract before calling through, so the
 * caller's authority is a property of the object it holds rather than of the
 * checks it remembered to write: pass a handle scoped to an editor and there is
 * no reachable path to `users.delete`.
 *
 * It fails CLOSED. A method with no contract is refused, not allowed — a
 * method that cannot say what it requires cannot be granted, and "undescribed
 * therefore ungated" is exactly how a privileged method reaches a caller that
 * was never meant to have it.
 *
 * It is also where a `sessionScoped` contract gets its subject: the handle fills
 * `userId` from the request context, so a per-user method's authority is the
 * caller's identity rather than an argument it chose. `decisions/0037` is why.
 *
 * This does NOT replace `permissionsFor`. Its `allows`/`allowsMethod` remain
 * the seam for route checks that carry custom logic the contract cannot state
 * — `users.get` allowing self-access without `users:read`, the last-admin guard.
 * Those routes keep asking; this handle is for callers that should not be asked
 * to.
 */
import type { EntryMethodName } from '@/entries/methods';
import type { NotificationsDomainService } from '@/notifications/service';
import type { EntryAction } from '@/permissions/entry-permission';
import type { Permissions } from '@/permissions/permissions-for';
import type {
    EntriesService,
    MediaService,
    Role,
    ServiceMethodContract,
    SettingsService,
    UsersService,
} from '@/types/index';
import { ENTRY_METHOD_ACTIONS } from '@/entries/methods';
import { entriesService } from '@/entries/service';
import { PermissionDeniedError } from '@/errors/index';
import { mediaContract } from '@/media/contract';
import { mediaService } from '@/media/service';
import { notificationsContract } from '@/notifications/contract';
import { notificationsService } from '@/notifications/service';
import { entryPermission } from '@/permissions/entry-permission';
import { PERMISSION_ENTRY_READ_FULL } from '@/permissions/index';
import { permissionsFor } from '@/permissions/permissions-for';
import { getCurrentUser } from '@/request-context/index';
import { settingsContract } from '@/settings/contract';
import { settingsService } from '@/settings/service';
import { usersContract } from '@/users/contract';
import { usersService } from '@/users/service';

/**
 * A domain's contract catalogue, keyed by service method name.
 *
 * Read at `Input = unknown` — the same generality `codegen/method-manifest.ts`
 * reads the catalogues at. Nothing here inspects an input type; it only resolves
 * the declared permission, so the input side stays unknown.
 */
type ContractCatalogue = Record<string, ServiceMethodContract>;

/** Anything callable through a string key. */
type ServiceRecord = Record<string, unknown>;

/** A method as this wrapper calls it: one parameter object, any return. */
type ServiceFn = (...args: unknown[]) => unknown;

/**
 * The input a session-scoped method is called with: the caller's own `userId`,
 * pinned LAST so a caller-supplied one is overwritten rather than trusted. Such
 * a method declares no permission — you may always reach your own rows — so the
 * pinning is the whole of its authorization, exactly as `scopeEntries` pins the
 * entry type it derives a permission from.
 *
 * Refused outright when nobody is signed in: the method's subject comes from the
 * session, and there is no sensible subject for a caller that has none.
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
    const rule = contract.permission;
    if (rule === undefined) return null;
    return typeof rule === 'function' ? rule(input) : rule;
}

/**
 * Wrap every method of `service` in its declared permission check.
 *
 * The returned object keeps `service`'s type: a denied method still EXISTS, it
 * refuses. Hiding the key instead would turn "you may not" into "no such
 * method", which reads as a bug to every caller and to an AI tool-loop alike.
 *
 * A permission refusal THROWS rather than returning a rejected promise, so the
 * wrapper can cover a synchronous method as honestly as an async one. A
 * session-scoped method rejects instead — its subject needs an await.
 *
 * @param domain Name the method ids are built from (`users` → `users.create`).
 */
export function scopeMethods<S extends object>(
    service: S,
    contracts: ContractCatalogue,
    permissions: Permissions,
    domain: string
): S {
    const scoped: ServiceRecord = {};

    for (const [key, value] of Object.entries(service as ServiceRecord)) {
        if (typeof value !== 'function') {
            scoped[key] = value;
            continue;
        }
        const fn = value as ServiceFn;
        const id = `${domain}.${key}`;

        scoped[key] = (...args: unknown[]): unknown => {
            const contract = contracts[key];
            if (contract === undefined) throw new PermissionDeniedError(id, null);

            const input = args[0];
            if (!permissions.allowsMethod(contract, input)) {
                throw new PermissionDeniedError(id, resolvePermission(contract, input));
            }
            // Called on the service so a method reaching for a sibling through
            // `this` keeps working. Only the session-scoped branch is async —
            // resolving the subject needs an await, and such a method is async
            // anyway.
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
 *
 * `query` accepts a list of types (a cross-type listing), so a call can target
 * more than one; every method takes `{ type, ... }`. A call must hold the
 * permission for EVERY type it touches — a list is not a way to reach a type the
 * role lacks by pairing it with one it holds.
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
 *
 * `full` is a second axis of authority that no per-type permission covers, and
 * it travels in the SAME argument object as `type` — so a wrapper that checked
 * only `entry:<type>:read` would hand the admin projection to anyone holding
 * plain read. Checked for every method, not only the ones whose signature
 * declares `full` today: a method that grows the option must not silently grow
 * a bypass with it.
 */
function wantsFullShape(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    return (input as { full?: unknown }).full === true;
}

/**
 * Scope the entries service. Entries needs its own wrapper because its
 * permission is per (type, action) — `entry:posts:update` is not
 * `entry:pages:update` — so the check cannot come from a fixed contract, only
 * from the type the call actually names.
 *
 * The (method → action) pairing is read from `ENTRY_METHOD_ACTIONS`, the same
 * declaration the per-type contracts and the manifest are built from. A method
 * missing from it, or a call that names no usable type, is refused: a permission
 * this wrapper had to guess at would be a permission it could guess wrong.
 *
 * `entry:read:full` is enforced here too. It was enforced ONLY in the HTTP
 * entries routes, which is the layer this handle exists to replace for callers
 * that get no route — so leaving it there would have made `{ full: true }` a
 * way past the projection for every caller holding a bare read.
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
        notifications: scopeMethods(
            notificationsService,
            notificationsContract,
            permissions,
            'notifications'
        ),
    };
}
