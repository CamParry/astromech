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
 * This does NOT replace `permissionsFor`. Its `allows`/`allowsMethod` remain
 * the seam for route checks that carry custom logic the contract cannot state
 * — `users.get` allowing self-access without `users:read`, the last-admin guard.
 * Those routes keep asking; this handle is for callers that should not be asked
 * to.
 */

import type {
    ContentService,
    EntriesService,
    MediaService,
    Role,
    ServiceMethodContract,
    SettingsService,
    UsersService,
} from '@/types/index.js';
import { PermissionDeniedError } from '@/errors/index.js';
import { entryPermission, type EntryAction } from '@/permissions/entry-permission.js';
import { PERMISSION_ENTRY_READ_FULL } from '@/permissions/index.js';
import { permissionsFor, type Permissions } from '@/permissions/permissions-for.js';
import { usersService } from '@/users/service.js';
import { usersContract } from '@/users/methods.js';
import { mediaService } from '@/media/service.js';
import { mediaContract } from '@/media/methods.js';
import { settingsService } from '@/settings/service.js';
import { settingsContract } from '@/settings/methods.js';
import { entriesService } from '@/entries/service.js';
import { ENTRY_METHOD_ACTIONS, type EntryMethodName } from '@/entries/methods.js';
import { contentService } from '@/content/service.js';
import { contentContract } from '@/content/methods.js';

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
 * A refusal THROWS rather than returning a rejected promise, so the wrapper can
 * cover a synchronous method as honestly as an async one. `await service.x()`
 * catches it either way.
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
            // `this` keeps working.
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
 * The single entry type one content call targets, or null when it names none.
 *
 * A content operation rewrites ONE entry, so a `type` that is missing, empty or
 * not a string is ill-formed rather than a wildcard.
 */
function targetedContentType(input: unknown): string | null {
    if (typeof input !== 'object' || input === null) return null;
    const type = (input as { type?: unknown }).type;
    return typeof type === 'string' && type.length > 0 ? type : null;
}

/**
 * Scope the content service. Content is double-gated: the contract's
 * `content:*` permission AND `update` on the entry type the call names, because
 * holding "may use a model" must not rewrite a type the role cannot edit by
 * hand.
 *
 * The first half comes from a fixed catalogue like `scopeMethods`; the second is
 * derived from the call like `scopeEntries`, through the same
 * `entryPermission` helper the entries wrapper and the HTTP route use. A method
 * with no contract, or a call naming no usable type, is refused.
 */
export function scopeContent(
    service: ContentService,
    permissions: Permissions
): ContentService {
    const scoped: ServiceRecord = {};
    const contracts: ContractCatalogue = contentContract;

    for (const [key, value] of Object.entries(service as unknown as ServiceRecord)) {
        if (typeof value !== 'function') {
            scoped[key] = value;
            continue;
        }
        const fn = value as ServiceFn;
        const id = `content.${key}`;

        scoped[key] = (...args: unknown[]): unknown => {
            const contract = contracts[key];
            if (contract === undefined) throw new PermissionDeniedError(id, null);

            const input = args[0];
            if (!permissions.allowsMethod(contract, input)) {
                throw new PermissionDeniedError(id, resolvePermission(contract, input));
            }

            const type = targetedContentType(input);
            if (type === null) {
                throw new PermissionDeniedError(
                    id,
                    null,
                    'was called without an entry type, so the permission it needs cannot be derived.'
                );
            }

            const permission = entryPermission(type, 'update');
            if (!permissions.allows(permission)) {
                throw new PermissionDeniedError(id, permission);
            }

            return fn.apply(service, args);
        };
    }

    return scoped as unknown as ContentService;
}

/** The five content domains, each scoped to one role. */
export type ScopedServices = {
    users: UsersService;
    media: MediaService;
    settings: SettingsService;
    entries: EntriesService;
    content: ContentService;
};

/**
 * Compose one role into a handle over every content domain.
 *
 * One `permissionsFor` guard backs all five, so the role is resolved once per
 * handle rather than once per call.
 */
export function scopedServices(role: Role | undefined): ScopedServices {
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
        content: scopeContent(contentService, permissions),
    };
}
