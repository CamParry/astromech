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
 * A service interface's parameter as a Zod schema's call side expresses it: an
 * optional property reads `T | undefined`, which `exactOptionalPropertyTypes`
 * keeps distinct from the `T` a hand-written interface declares. Used to
 * compare the two in {@link MethodsFor}, and nowhere else.
 */
type CallInput<Input> = Input extends object
    ? { [K in keyof Input]: undefined extends Input[K] ? Input[K] | undefined : Input[K] }
    : Input;

/**
 * One service method: what it demands of its caller, what it does, and the
 * schemas it is called and answers with. There is no `name` — `defineService`
 * stamps a method's dotted id from its position in the catalogue, so a typo
 * cannot produce a mis-named manifest entry with no build failure.
 *
 * `Ctx` is unbounded because the plugin layer narrows `config`, `entries` and
 * `globals`, so `PluginContext` is not a subtype of `AppContext`.
 *
 * `Input` and `Parsed` are the two sides of the `input` schema: a defaulted or
 * coercing key is optional to the caller and set by the time the handler reads
 * it. They are the same type for a schema that neither defaults nor transforms,
 * which is why `Parsed` defaults to `Input`.
 */
export type ServiceMethod<
    Input = unknown,
    Output = unknown,
    Ctx = AppContext,
    Parsed = Input,
> = {
    /** What the caller must hold to call this method. */
    access: ServiceMethodAccess<Input>;
    handler: (input: Parsed, ctx: Ctx & MethodContext) => Promise<Output> | Output;
    /** One-line summary for humans / the AI tool-loop. */
    summary?: string;
    /**
     * Zod schema for the call input — the METHOD schema, not the HTTP body: a
     * transport putting part of it in the path (`settings.set({ key, value })`)
     * still declares the whole argument object. Parsed before the handler runs,
     * so it is the source of both input types: `Input` is what a caller passes
     * (`z.input`), `Parsed` what the handler receives (`z.output`).
     */
    input: z.ZodType<Parsed, Input>;
    /** Zod schema for the result, where worth declaring. */
    output?: z.ZodType<Output>;
    /** The capability the target must declare; absent ⇒ none. */
    requires?: string;
    /**
     * The method acts on the CALLER'S OWN rows, and the handler reads that
     * subject from `ctx.user` rather than from its input. No permission is
     * declared, since you may always reach your own rows.
     *
     * A transport with no signed-in user cannot call the method at all: the
     * scoped handle refuses it with a declared reason, the way `binaryInput`
     * is refused.
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
 * A method as it is AUTHORED. `input` stays the concrete schema, so both input
 * types are read off it and the handler's parameter needs no annotation. The
 * two are separate positions for a reason: `z.input<S>` and `z.output<S>` are
 * not inference sites, so the schema alone decides them, where a bare
 * `ServiceMethod` would let `access` decide `Input` instead.
 */
export type ServiceMethodDefinition<S extends z.ZodType, Output, Ctx = AppContext> = Omit<
    ServiceMethod<z.input<S>, Output, Ctx, z.output<S>>,
    'handler' | 'input'
> & {
    input: S;
    handler: (input: z.output<S>, ctx: Ctx & MethodContext) => Promise<Output> | Output;
};

/**
 * The interim handler-less form the readers (the manifest generator,
 * `permissionsFor`, `scopedServices`, the REST mount) are typed over while the
 * core catalogues still declare no handlers. Deleted when they all do.
 *
 * Variance-safe over any concrete method, as `AnyServiceMethod` is: `Input` is
 * contravariant in `access` and covariant in `input`, so the schema position is
 * widened separately.
 */
export type ServiceMethodContract = Omit<
    ServiceMethod<never, unknown>,
    'handler' | 'input'
> & {
    input: z.ZodType;
};

/**
 * One method as the interface it is assembled under checks it. The comparison
 * is the CALL side alone: the schema must accept what the interface declares,
 * and answer what it promises.
 *
 * The handler's parameter and the schema's parsed type are the method's own
 * business (a schema that defaults a key hands the handler a shape no interface
 * states), so both are widened out of the comparison the way `AnyServiceMethod`
 * widens them: `never` where the position is contravariant, `unknown` where it
 * is covariant. `access` is not part of an interface's contract at all.
 */
type ServiceMethodFor<Input, Output, Ctx> = Omit<
    ServiceMethod<never, Output, Ctx>,
    'handler' | 'input'
> & {
    handler: (input: never, ctx: Ctx & MethodContext) => Promise<Output> | Output;
    input: z.ZodType<unknown, CallInput<Input>>;
};

/**
 * The method record a hand-written service interface demands. A method the
 * interface declares with no parameter reads `Input = unknown`, which every
 * schema's call type satisfies, so `ctx.notifications.count()` stays a legal
 * bare call whatever its schema.
 */
export type MethodsFor<S, Ctx = AppContext> = {
    [K in keyof S]: S[K] extends (input: infer I) => infer R
        ? ServiceMethodFor<I, Awaited<R>, Ctx>
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
     * The method acts on the caller's own rows, read from the session — see
     * `ServiceMethodContract['sessionScoped']`. A transport with no signed-in
     * user refuses it. Emitted only when true.
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
