/**
 * Service-method contracts — the self-description a service method carries so
 * the manifest, MCP projection, CLI and the assistant can all deal in one unit.
 * Identical shape for core and plugin methods.
 *
 * The projected form (`ManifestMethod`) lives here too, in the pure leaf, rather
 * than in the generator that emits it: the generator, the MCP transport and the
 * CLI all deal in the same record, and every consumer that redeclared "the bit
 * it needed" drifted from the emitter within one change.
 */

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
 * A method's declared permission: either a fixed permission string, or one
 * resolved from the call input (e.g. globals, where the permission depends on
 * the target key). Absent ⇒ the method is not permission-gated; a rule
 * returning `null` says the same for that one input, which is how a `public`
 * global's plain read is ungated while its `full` read is not.
 */
export type PermissionRule<Input = unknown> =
    | Permission
    | ((input: Input) => Permission | null);

/**
 * A core service method's declared contract, authored in its domain's catalogue
 * — the single declaration the `permissionsFor` guard enforces and the manifest
 * reads. Plugin methods declare the same facts on their `ServiceMethod` object.
 *
 * There is no `name`: a method's dotted id is its position in the catalogue
 * (`<module>.<key>`), derived by the manifest generator. Restating it by hand
 * meant a typo produced a mis-named manifest entry with no build failure.
 */
export type ServiceMethodContract<Input = unknown, Output = unknown> = {
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
    /** The permission this method requires; absent ⇒ no permission gate. */
    permission?: PermissionRule<Input>;
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
