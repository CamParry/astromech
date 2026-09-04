/**
 * A service method: the handler plus the self-description the manifest, MCP
 * projection, CLI and assistant all deal in. `defineService` assembles a
 * catalogue of them into a service. Identical shape for core and plugin methods.
 */

import type { AppContext } from './app-context';
import type { Permission } from './domain';
import type { z } from '@hono/zod-openapi';

/**
 * MCP-aligned effect hints (ai-integration §3.6). `mutates` is the query/command
 * split; `destructive`/`idempotent` are the small editorial layer over it.
 */
export type ServiceMethodEffect = {
    /** Command (true) vs query (false): does the method change persisted state? */
    mutates: boolean;
    /** Irreversible or data-losing (delete entry/user, unpublish). MCP destructiveHint. */
    destructive?: boolean;
    /** Repeating the call lands the same end-state. MCP idempotentHint. */
    idempotent?: boolean;
};

/**
 * What a method demands of its caller. `'authenticated'` holds when the caller
 * has a role, `Permission` is the bare core form, `{ permission }` is the plugin
 * form resolved under the plugin's namespace, and the function form answers per
 * input — `null` for none.
 */
export type ServiceMethodAccess<Input = unknown> =
    | 'public'
    | 'authenticated'
    | Permission
    | { permission: string }
    | ((input: Input) => Permission | null);

/**
 * The two core forms of {@link ServiceMethodAccess}: a fixed permission string,
 * or one resolved from the call input (e.g. globals, where the permission
 * depends on the target key).
 */
export type PermissionRule<Input = unknown> =
    | Permission
    | ((input: Input) => Permission | null);

/** The one fact a handler learns about itself: the id it was assembled under. */
export type MethodContext = {
    method: { name: string };
};

/**
 * One service method: what it demands of its caller, what it does, and the
 * schemas it is called and answers with. There is no `name` — `defineService`
 * stamps a method's dotted id from its position in the catalogue, so a typo
 * cannot produce a mis-named manifest entry with no build failure.
 *
 * `Ctx` is unbounded because the plugin layer narrows `config`, `entries` and
 * `globals`, so `PluginContext` is not a subtype of `AppContext`.
 */
export type ServiceMethod<Input = unknown, Output = unknown, Ctx = AppContext> = {
    /** What the caller must hold to call this method. */
    access: ServiceMethodAccess<Input>;
    handler: (input: Input, ctx: Ctx & MethodContext) => Promise<Output> | Output;
    /** One-line summary for humans / the AI tool-loop. */
    summary?: string;
    /**
     * Zod schema for the call input — the METHOD schema (how the method is
     * called), NOT the HTTP body. A method whose transport puts part of the
     * input in the path (`settings.set({ key, value })`) still declares the
     * whole argument object here.
     */
    input?: z.ZodType<Input>;
    /** Zod schema for the result, where worth declaring. */
    output?: z.ZodType<Output>;
    /** The capability the target must declare; absent ⇒ none. */
    requires?: string;
    /**
     * The method acts on the CALLER'S OWN rows. Its `userId` argument is filled
     * from the request context by `policies/scoped-services.ts`, and a
     * caller-supplied one is overwritten rather than trusted — such a method
     * carries no permission (you may always reach your own rows), so an input
     * `userId` would be an impersonation hole with nothing to gate it.
     *
     * The `input` schema therefore omits `userId`: it is not the caller's to
     * pass. A transport with no signed-in user cannot call the method at all and
     * refuses it with a declared reason, the way `binaryInput` is refused.
     */
    sessionScoped?: boolean;
    /**
     * The input carries a value JSON cannot express — a `File`, a stream. Such a
     * method is unreachable from a JSON-RPC transport however well it describes
     * itself, so it declares that here rather than leaving each transport to keep
     * its own list of exceptions.
     *
     * `unrepresentable: 'any'` degrades a `File` to `{}` instead of throwing, so
     * the emitted schema LOOKS callable. Without this flag a generic dispatcher
     * offers the method and fails at invoke time.
     */
    binaryInput?: boolean;
} & ServiceMethodEffect;

/**
 * The interim handler-less form the readers (the manifest generator,
 * `permissionsFor`, `scopedServices`, the REST mount) are typed over while the
 * core catalogues still declare no handlers. Deleted when they all do.
 */
export type ServiceMethodContract<Input = unknown, Output = unknown> = Omit<
    ServiceMethod<Input, Output>,
    'handler'
>;

/** The method record a hand-written service interface demands. */
export type MethodsFor<S, Ctx = AppContext> = {
    [K in keyof S]: S[K] extends (input: infer I) => infer R
        ? ServiceMethod<I, Awaited<R>, Ctx>
        : never;
};

/** A method after assembly: the same object, with the id it was assembled under. */
export type NamedServiceMethod<M> = M & { name: string };

/** One service: its catalogue of methods, and the interface they bind to. */
export type ServiceDefinition<S> = {
    name: string;
    /** The methods, keyed as the interface keys them, each stamped with `name`. */
    catalogue: { [K in keyof MethodsFor<S>]: NamedServiceMethod<MethodsFor<S>[K]> };
    /** The interface, with every handler closed over `ctx`. */
    bind(ctx: AppContext): S;
};

// Method manifest — the serialised projection of the contracts

/**
 * A serialised JSON Schema object. `null` records a schema that could not be
 * represented; `undefined` records one that was never declared.
 */
export type JsonSchemaObject = Record<string, unknown>;

/**
 * A plugin service method's access level, flattened for serialisation.
 * `'permission'` is the object form — the concrete string travels in
 * `ManifestMethodBase['permission']`.
 */
export type ManifestAccess = 'public' | 'authenticated' | 'permission';

/** The facts every manifest method carries, whatever its origin. */
type ManifestMethodBase = {
    /**
     * Globally unique, stable, sortable address for this method.
     *
     * `name` is NOT an identifier — `entries.create` is the name of every entry
     * type's create. The id adds the dimension the name lacks and is the only
     * key a consumer may index or look a method up by.
     */
    id: string;
    /** Dotted method name, e.g. `users.create`, `entries.get`. Not unique. */
    name: string;
    /** One-line human summary. */
    summary?: string | undefined;
    /**
     * Static permission string, or null when the permission is dynamic
     * (resolved at call time from the input — see `permissionDynamic`).
     */
    permission: string | null;
    /** True when `permission` is null because it is input-derived, not absent. */
    permissionDynamic?: true;
    /** Does the method change persisted state? */
    mutates: boolean;
    /** Irreversible or data-losing? */
    destructive: boolean;
    /** Repeating the call lands the same end-state? */
    idempotent: boolean;
    /** JSON Schema for the ARGUMENT OBJECT the method is called with. */
    input?: JsonSchemaObject | null;
    /** JSON Schema for the call output. */
    output?: JsonSchemaObject | null;
    /**
     * The input carries a value JSON cannot express, so a JSON-RPC transport
     * cannot call this method — see `ServiceMethodContract['binaryInput']`.
     * Emitted only when true, so absence means "callable".
     */
    binaryInput?: true;
    /**
     * The method acts on the caller's own rows and takes its `userId` from the
     * session — see `ServiceMethodContract['sessionScoped']`. A transport with
     * no signed-in user refuses it. Emitted only when true.
     */
    sessionScoped?: true;
};

/** A core domain method (`users`, `media`, `settings`). */
export type CoreManifestMethod = ManifestMethodBase & {
    source: 'core';
    /** Module the catalogue belongs to — `id` is `<module>.<method>`. */
    module: string;
    /** Key on the module's service API, e.g. `update`. */
    method: string;
};

/** One entry type's projection of one `EntriesService` method. */
export type EntriesManifestMethod = ManifestMethodBase & {
    source: 'entries';
    /** Key on `EntriesService`, e.g. `publish`. */
    method: string;
    /**
     * The type id the service is actually called with: bare for a root type
     * (`posts`), qualified for a plugin type (`redirects/redirect`). Carried
     * rather than re-derived from `namespace` + `entryType` — those are a permission
     * namespace and a label, and re-deriving an identifier is how they drift.
     */
    typeId: string;
    /** Bare wire type, e.g. `posts`. */
    entryType: string;
    /** `'root'`, or the owning plugin's permission namespace. */
    namespace: string;
    /** Plugin namespace this entry type belongs to; absent for root types. */
    plugin?: string;
};

/** A plugin-declared service method. */
export type PluginManifestMethod = ManifestMethodBase & {
    source: 'plugin';
    /** Plugin namespace. */
    plugin: string;
    /** Plugin service key — `id` is `plugins.<serviceKey>.<method>`. */
    serviceKey: string;
    /** Key on the plugin's `service` object. */
    method: string;
    access: ManifestAccess;
};

/** One entry in the manifest's methods array, discriminated by `source`. */
export type ManifestMethod =
    | CoreManifestMethod
    | EntriesManifestMethod
    | PluginManifestMethod;

/** The emitted method manifest document. */
export type MethodManifest = {
    version: number;
    methods: ManifestMethod[];
};

// Tool dispatch — the callable projection of a manifest method

/** Annotations carried on a tool definition. */
export type ToolAnnotations = {
    title?: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
};

/** A single tool: its declaration, plus the handler that runs it. */
export type ToolDefinition = {
    name: string;
    /**
     * The manifest method id this tool projects, e.g. `entries.page.publish`.
     * `annotations.title` carries it too, but that field is optional and a
     * title is not an identity — a caller recording what ran indexes on this.
     */
    id: string;
    description: string;
    inputSchema: JsonSchemaObject;
    annotations: ToolAnnotations;
    /**
     * The permission this tool's method declares — null when it is ungated, or
     * when it is input-derived (see `permissionDynamic`).
     *
     * Carried, NOT enforced, and deliberately unread today: this MCP server is
     * dev-only and trusted, runs with no role, and enforces a method's
     * permission no more than the CLI does. It exists so the seam is already in
     * place when a remote transport — which does carry a role — dispatches
     * through here; that transport enforces via `policies/scoped-services.ts`,
     * and reads this only to say up front what it would refuse.
     */
    permission: string | null;
    /** True when `permission` is null because the method derives it from the input. */
    permissionDynamic: boolean;
    /**
     * The question to put to a human before running this method with these
     * arguments. Core owns the wording so a transport that pauses on a mutating
     * call cannot invent its own.
     */
    confirmMessage: (args: Record<string, unknown>) => string;
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};
