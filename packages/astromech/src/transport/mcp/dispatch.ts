/**
 * MCP Tool Dispatch
 *
 * ONE dispatcher for every manifest method. A tool's name, description, schema
 * and annotations are all projections of manifest fields, and `invoke` resolves
 * the service method by key at call time. There is no per-domain adapter, and no
 * `switch` over method names.
 *
 * Every adapter this replaced was a second declaration of a method that already
 * described itself, and the second declaration is what drifted: `users_update`
 * advertised a hand-written schema that rejected custom user fields for months.
 * A dispatcher that cannot restate a method cannot disagree with it, and adding
 * a descriptor is now all it takes to get a tool.
 *
 * A method is skipped only for a reason it declares — no input schema, or a
 * `binaryInput` a JSON-RPC transport cannot carry. Each skip carries that reason
 * so the server can log deliberate omissions as deliberate.
 */

import type {
    CoreManifestMethod,
    EntriesManifestMethod,
    JsonSchemaObject,
    ManifestMethod,
    PluginContext,
    PluginManifestMethod,
    Role,
} from '@/types/index.js';
import type { ScopedService } from '@/policies/scoped-service.js';

// ============================================================================
// Types
// ============================================================================

/** Annotations carried on a tool definition. */
export type ToolAnnotations = {
    title?: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
};

/** A fully-resolved dispatch descriptor for a single MCP tool. */
export type ToolDispatch = {
    toolName: string;
    description: string;
    inputSchema: JsonSchemaObject;
    annotations: ToolAnnotations;
    /**
     * The permission this tool's method declares — null when it is ungated, or
     * when it is input-derived (see `permissionDynamic`).
     *
     * Carried, NOT enforced, and deliberately unread today: this MCP server is
     * dev-only and trusted, runs with no principal, and enforces a method's
     * permission no more than the CLI does. It exists so the seam is already in
     * place when a remote transport — which does have a principal — dispatches
     * through here; that transport enforces via `policies/scoped-service.ts`,
     * and reads this only to say up front what it would refuse.
     */
    permission: string | null;
    /** True when `permission` is null because the method derives it from the input. */
    permissionDynamic: boolean;
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Either a dispatchable tool or the reason there isn't one. A bare `null` told
 * the caller nothing, so every omission looked the same as a bug.
 */
export type DispatchResult =
    | { ok: true; tool: ToolDispatch }
    | { ok: false; reason: string };

/** Anything callable by string key — a domain service or a plugin's service record. */
type ServiceObject = Record<string, unknown>;

/** The shape `invoke` takes once a method has been resolved to a call. */
type Invoke = (args: Record<string, unknown>) => Promise<unknown>;

/** What a resolution strategy answers with: the call, or why there isn't one. */
type ResolvedInvoke = { ok: true; invoke: Invoke } | { ok: false; reason: string };

/** A strategy for turning a manifest method into the call it maps to. */
type ResolveStrategy = (manifest: ManifestMethod) => ResolvedInvoke;

// ============================================================================
// Service resolution
// ============================================================================

/**
 * Core domain services, keyed by the manifest's `domain`. Imported lazily so
 * building the tool LIST pulls in no service code; only an actual call does.
 */
const CORE_SERVICES: Record<string, () => Promise<ServiceObject>> = {
    users: async () => (await import('@/users/service.js')).usersApi,
    media: async () => (await import('@/media/service.js')).mediaApi,
    settings: async () => (await import('@/settings/service.js')).settingsApi,
    content: async () => (await import('@/content/service.js')).contentApi,
};

async function getEntriesService(): Promise<ServiceObject> {
    return (await import('@/entries/service.js')).entries as unknown as ServiceObject;
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
 * The context carries the current user, which is `null` on this transport — MCP
 * is dev-only and trusted, exactly like the CLI, and a method's declared
 * `access` is not enforced here any more than a core method's permission is.
 * Request-scoped principals and a real permission wrapper are P2; when
 * `getCurrentUser()` starts returning one, this call site needs no change.
 */
async function invokePluginMethod(
    manifest: PluginManifestMethod,
    args: Record<string, unknown>
): Promise<unknown> {
    const [{ getCurrentUser }, runtime] = await Promise.all([
        import('@/context/index.js'),
        import('@/plugins/runtime/plugin-runtime.js'),
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
        runtime.createPluginContext(identity, getCurrentUser())
    );
}

// ============================================================================
// Naming
// ============================================================================

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

// ============================================================================
// Public builders
// ============================================================================

/**
 * Build a ToolDispatch from a ManifestMethod, or explain why the method is not
 * callable over JSON-RPC. `invoke` calls the raw domain services, so this is for
 * a trusted caller with no principal — the dev-only MCP server and the CLI.
 */
export function buildDispatch(manifest: ManifestMethod): DispatchResult {
    return buildDispatchWith(manifest, resolveInvoke);
}

/**
 * The same dispatch, resolved through `scopedService(principal)` so every call
 * is checked against what the principal holds. `undefined` means no principal —
 * allowed nothing — never a trusted caller; that is what `buildDispatch` is for.
 */
export function buildScopedDispatch(
    manifest: ManifestMethod,
    principal: Role | undefined
): DispatchResult {
    const handle = scopedHandle(principal);
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
            toolName: toolNameFor(manifest),
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
            invoke: resolved.invoke,
        },
    };
}

// ============================================================================
// Resolution — raw services
// ============================================================================

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

/** The refusal for a manifest domain that names no registered service. */
function noServiceReason(manifest: ManifestMethod): string {
    return `no service registered for domain "${manifest.name}"`;
}

// ============================================================================
// Resolution — scoped to a principal
// ============================================================================

/** The principal's scoped handle, built on first use and reused after it. */
type ScopedHandle = () => Promise<ScopedService>;

/**
 * A handle factory for one dispatch. `scopedService` is imported lazily for the
 * same reason `CORE_SERVICES` is: building the tool list must pull in no service
 * code, and that module imports every domain service eagerly.
 */
function scopedHandle(principal: Role | undefined): ScopedHandle {
    let handle: Promise<ScopedService> | null = null;
    return () => {
        handle ??= import('@/policies/scoped-service.js').then(({ scopedService }) =>
            scopedService(principal)
        );
        return handle;
    };
}

/** The scoped call this method maps to, or why the principal gets none. */
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
            return { ok: false, reason: 'plugin method — not scoped to a principal yet' };
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
    const domain = manifest.domain as Exclude<keyof ScopedService, 'entries'>;
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
