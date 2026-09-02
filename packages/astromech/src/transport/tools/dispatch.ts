/**
 * Tool Dispatch
 *
 * One dispatcher for every manifest method, shared by the MCP server and the
 * AI tool loop: a tool's schema and invoke are projections of manifest
 * fields, so no per-domain adapter can drift from the method it describes.
 */

import type { ScopedServices } from '@/policies/scoped-services';
import type {
    CoreManifestMethod,
    EntriesManifestMethod,
    ManifestMethod,
    PluginContext,
    PluginManifestMethod,
    Role,
    ToolDefinition,
} from '@/types/index';
import { confirmMessage } from '@/policies/confirmation';

// The dispatch shapes live in the pure leaf so `types/plugins.ts` can name them.
export type { ToolAnnotations, ToolDefinition } from '@/types/index';

/**
 * Either a dispatchable tool or the reason there isn't one. A bare `null` told
 * the caller nothing, so every omission looked the same as a bug.
 */
export type DispatchResult =
    | { ok: true; tool: ToolDefinition }
    | { ok: false; reason: string };

/** Anything callable by string key — a domain service or a plugin's service record. */
type ServiceObject = Record<string, unknown>;

/** The shape `invoke` takes once a method has been resolved to a call. */
type Invoke = (args: Record<string, unknown>) => Promise<unknown>;

/** What a resolution strategy answers with: the call, or why there isn't one. */
type ResolvedInvoke = { ok: true; invoke: Invoke } | { ok: false; reason: string };

/** A strategy for turning a manifest method into the call it maps to. */
type ResolveStrategy = (manifest: ManifestMethod) => ResolvedInvoke;

/**
 * Core domain services, keyed by the manifest's `domain`. Imported lazily so
 * building the tool LIST pulls in no service code; only an actual call does.
 */
const CORE_SERVICES: Record<string, () => Promise<ServiceObject>> = {
    users: async () => (await import('@/users/service')).usersService,
    media: async () => (await import('@/media/service')).mediaService,
    settings: async () => (await import('@/settings/service')).settingsService,
    globals: async () =>
        (await import('@/globals/service')).globalsService as unknown as ServiceObject,
    notifications: async () =>
        (await import('@/notifications/service')).notificationsService,
};

async function getEntriesService(): Promise<ServiceObject> {
    return (await import('@/entries/service')).entriesService as unknown as ServiceObject;
}

/**
 * Call `service[key](args)`. Every service method takes a single parameter
 * object — P0a normalised the last positional ones — which is what lets one line
 * stand in for all the per-method argument shuffling the adapters used to do.
 *
 * Called with `service` as the receiver so a method that reaches for a sibling
 * through the object keeps working; a detached function reference would pass
 * today and break on the first one that doesn't.
 */
async function callServiceMethod(
    service: ServiceObject,
    key: string,
    args: unknown
): Promise<unknown> {
    const fn = service[key];
    if (typeof fn !== 'function') {
        throw new Error(
            `Method "${key}" is in the manifest but absent from the service it names.`
        );
    }
    return (fn as (input: unknown) => Promise<unknown>).call(service, args);
}

/**
 * Invoke a plugin service method through the same registry the HTTP RPC route
 * uses, resolved at CALL time. `runMcpServer` registers the plugins at boot; a
 * missing entry means it did not, and says so rather than failing silently.
 *
 * The context carries the current user and role, both `null` on this transport
 * — MCP runs with no request scope, and it is dev-only and trusted, so a
 * method's declared `access` is not enforced here any more than a core method's
 * permission is. A real permission wrapper is P2.
 */
async function invokePluginMethod(
    manifest: PluginManifestMethod,
    args: Record<string, unknown>
): Promise<unknown> {
    const [{ getCurrentRole, getCurrentUser }, runtime] = await Promise.all([
        import('@/request-context/request-context'),
        import('@/plugins/runtime/plugin-runtime'),
    ]);

    const identity = runtime.getPluginIdentity(manifest.serviceKey);
    if (!identity) {
        throw new Error(
            `Plugin "${manifest.serviceKey}" is not registered in this process.`
        );
    }

    const methods = runtime.getPluginServiceMethods().get(identity.namespace);
    const method = methods?.[manifest.method];
    if (!method) {
        throw new Error(
            `Plugin method "${manifest.serviceKey}.${manifest.method}" is not registered.`
        );
    }

    return (method.handler as (input: unknown, ctx: PluginContext) => Promise<unknown>)(
        args,
        runtime.createPluginContext(
            identity,
            await getCurrentUser(),
            await getCurrentRole()
        )
    );
}

/**
 * The tool name for a method. MCP names must match `^[a-zA-Z0-9_-]{1,128}$`, so
 * every separator is an underscore; `buildTools` still sanitises, because a
 * plugin's service key is author-supplied.
 */
function toolNameFor(manifest: ManifestMethod): string {
    switch (manifest.source) {
        case 'core':
            return `${manifest.domain}_${manifest.method}`;
        case 'plugin':
            return `plugins_${manifest.serviceKey}_${manifest.method}`;
        case 'entries':
            // Root types are addressed bare; a plugin type keeps its mount, so
            // two plugins mounting a `page` type do not collide.
            return manifest.mount === 'root'
                ? `entries_${manifest.entryType}_${manifest.method}`
                : `entries_${manifest.mount}_${manifest.entryType}_${manifest.method}`;
    }
}

/**
 * Build a ToolDefinition from a ManifestMethod, or explain why the method is not
 * callable over JSON-RPC. `invoke` calls the raw domain services, so this is for
 * a trusted caller with no role — the dev-only MCP server and the CLI.
 */
export function buildDispatch(manifest: ManifestMethod): DispatchResult {
    return buildDispatchWith(manifest, resolveInvoke);
}

/**
 * The same dispatch, resolved through `scopedServices(role)` so every call is
 * checked against what the role holds. A missing role is allowed nothing — never
 * a trusted caller; that is what `buildDispatch` is for.
 */
export function buildScopedDispatch(
    manifest: ManifestMethod,
    role: Role | null | undefined
): DispatchResult {
    const handle = scopedHandle(role);
    return buildDispatchWith(manifest, (method) => resolveScopedInvoke(method, handle));
}

/** Project a manifest method into a tool, with `resolve` supplying the call. */
function buildDispatchWith(
    manifest: ManifestMethod,
    resolve: ResolveStrategy
): DispatchResult {
    // Declared uncallable by the method itself (a `File` input). Checked before
    // the schema, because such a method HAS a schema — one that degrades to `{}`
    // and would otherwise look perfectly callable.
    if (manifest.binaryInput === true) {
        return { ok: false, reason: 'binary input — not expressible over JSON-RPC' };
    }

    // A method with no serialisable input cannot be honestly described to a
    // client, so it is skipped rather than given a hand-written stand-in that
    // drifts. This is the rule the `users_update` schema literal broke.
    const inputSchema = manifest.input ?? null;
    if (inputSchema === null) {
        return { ok: false, reason: 'no input schema declared on the descriptor' };
    }

    const resolved = resolve(manifest);
    if (!resolved.ok) {
        return { ok: false, reason: resolved.reason };
    }

    return {
        ok: true,
        tool: {
            name: toolNameFor(manifest),
            id: manifest.id,
            description: manifest.summary ?? manifest.name,
            inputSchema,
            annotations: {
                // The id, not the name: `entries.get` is the name of every entry
                // type's get, so a name would title nine tools identically.
                title: manifest.id,
                readOnlyHint: !manifest.mutates,
                destructiveHint: manifest.destructive,
                idempotentHint: manifest.idempotent,
            },
            permission: manifest.permission,
            permissionDynamic: manifest.permissionDynamic === true,
            confirmMessage: (args) => confirmMessage(manifest, args),
            invoke: resolved.invoke,
        },
    };
}

// Resolution — raw services

/** The raw-service call this method maps to. */
function resolveInvoke(manifest: ManifestMethod): ResolvedInvoke {
    switch (manifest.source) {
        case 'core':
            return resolveCoreInvoke(manifest);
        case 'entries':
            return {
                ok: true,
                invoke: async (args) =>
                    callServiceMethod(
                        await getEntriesService(),
                        manifest.method,
                        entriesArgs(manifest, args)
                    ),
            };
        case 'plugin':
            return { ok: true, invoke: (args) => invokePluginMethod(manifest, args) };
    }
}

function resolveCoreInvoke(manifest: CoreManifestMethod): ResolvedInvoke {
    // The raw services take a session-scoped method's `userId` as an ordinary
    // argument, and this path has nobody to fill it with: `buildDispatch` serves
    // the dev-only MCP server and the CLI, which run with no signed-in user. So
    // it is refused with its reason rather than called on a guessed subject —
    // `buildScopedDispatch`, whose handle fills it from the request context, is
    // the path such a method is reachable from.
    if (manifest.sessionScoped === true) {
        return { ok: false, reason: 'session-scoped — this transport has no user' };
    }
    const load = CORE_SERVICES[manifest.domain];
    if (!load) return { ok: false, reason: noServiceReason(manifest) };
    return {
        ok: true,
        invoke: async (args) => callServiceMethod(await load(), manifest.method, args),
    };
}

/**
 * The arguments an entries tool calls its service with. The type id is pinned
 * LAST — qualified (`redirects/redirect`) for a plugin-mounted type — so a
 * client cannot redirect the call at another type by passing one of its own.
 */
function entriesArgs(
    manifest: EntriesManifestMethod,
    args: Record<string, unknown>
): Record<string, unknown> {
    return { ...args, type: manifest.typeId };
}

/**
 * The argument object to VALIDATE a call against, for a transport that parses
 * before it invokes. An entries method takes its type from the id rather than
 * from the caller, and its schema pins that type as a constant, so the same
 * value `invoke` supplies has to be there before the schema sees it.
 */
export function dispatchArgs(
    manifest: ManifestMethod,
    args: Record<string, unknown>
): Record<string, unknown> {
    return manifest.source === 'entries' ? entriesArgs(manifest, args) : args;
}

/** The refusal for a manifest domain that names no registered service. */
function noServiceReason(manifest: ManifestMethod): string {
    return `no service registered for domain "${manifest.name}"`;
}

// Resolution — scoped to a role

/** The role's scoped handle, built on first use and reused after it. */
type ScopedHandle = () => Promise<ScopedServices>;

/**
 * A handle factory for one dispatch. `scopedServices` is imported lazily for the
 * same reason `CORE_SERVICES` is: building the tool list must pull in no service
 * code, and that module imports every domain service eagerly.
 */
function scopedHandle(role: Role | null | undefined): ScopedHandle {
    let handle: Promise<ScopedServices> | null = null;
    return () => {
        handle ??= import('@/policies/scoped-services').then(({ scopedServices }) =>
            scopedServices(role)
        );
        return handle;
    };
}

/** The scoped call this method maps to, or why the role gets none. */
function resolveScopedInvoke(
    manifest: ManifestMethod,
    handle: ScopedHandle
): ResolvedInvoke {
    switch (manifest.source) {
        case 'core':
            return resolveScopedCoreInvoke(manifest, handle);
        case 'entries':
            return {
                ok: true,
                invoke: async (args) =>
                    callServiceMethod(
                        (await handle()).entries as unknown as ServiceObject,
                        manifest.method,
                        entriesArgs(manifest, args)
                    ),
            };
        case 'plugin':
            // `invokePluginMethod` does not enforce the method's declared
            // `access` — the HTTP RPC route does that separately — so there is
            // nothing here to scope it with, and it is refused rather than run.
            return { ok: false, reason: 'plugin method — not scoped to a role yet' };
    }
}

function resolveScopedCoreInvoke(
    manifest: CoreManifestMethod,
    handle: ScopedHandle
): ResolvedInvoke {
    if (CORE_SERVICES[manifest.domain] === undefined) {
        return { ok: false, reason: noServiceReason(manifest) };
    }
    // The handle's core keys are exactly `CORE_SERVICES`' keys, checked above.
    const domain = manifest.domain as Exclude<keyof ScopedServices, 'entries'>;
    return {
        ok: true,
        invoke: async (args) =>
            callServiceMethod(
                (await handle())[domain] as unknown as ServiceObject,
                manifest.method,
                args
            ),
    };
}
