/**
 * Service-method descriptors — the self-description a service method carries so
 * the manifest, MCP projection, CLI and authoring AI can all deal in one unit.
 * Identical shape for core and plugin methods.
 *
 * The projected form (`ManifestMethod`) lives here too, in the pure leaf, rather
 * than in the generator that emits it: the generator, the MCP transport and the
 * CLI all deal in the same record, and every consumer that redeclared "the bit
 * it needed" drifted from the emitter within one change.
 */

import type { z } from '@hono/zod-openapi';
import type { Permission } from './domain.js';

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
 * resolved from the call input (e.g. entries, where the permission depends on
 * the target entry type). Absent ⇒ the method is not permission-gated.
 */
export type PermissionRule<Input = unknown> = Permission | ((input: Input) => Permission);

/**
 * A service method's descriptor. Authored once (via `defineServiceMethod` for
 * plugin methods, or a service's descriptor catalogue for core methods); the
 * single declaration the `permissionsFor` guard enforces and the manifest reads.
 *
 * There is no `name`: a method's dotted id is its position in the catalogue
 * (`<domain>.<key>`), derived by the manifest generator. Restating it by hand
 * meant a typo produced a mis-named manifest entry with no build failure.
 */
export type ServiceMethodDescriptor<Input = unknown, Output = unknown> = {
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

// ============================================================================
// Method manifest — the serialised projection of the descriptors
// ============================================================================

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
     * cannot call this method — see `ServiceMethodDescriptor['binaryInput']`.
     * Emitted only when true, so absence means "callable".
     */
    binaryInput?: true;
};

/** A core domain method (`users`, `media`, `settings`, `content`). */
export type CoreManifestMethod = ManifestMethodBase & {
    source: 'core';
    /** Domain the catalogue belongs to — `id` is `<domain>.<method>`. */
    domain: string;
    /** Key on the domain's service API, e.g. `update`. */
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
     * rather than re-derived from `mount` + `entryType` — those are a permission
     * namespace and a label, and re-deriving an identifier is how they drift.
     */
    typeId: string;
    /** Bare wire type, e.g. `posts`. */
    entryType: string;
    /** `'root'`, or the owning plugin's permission namespace. */
    mount: string;
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

// ============================================================================
// Tool dispatch — the callable projection of a manifest method
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
     * dev-only and trusted, runs with no role, and enforces a method's
     * permission no more than the CLI does. It exists so the seam is already in
     * place when a remote transport — which does carry a role — dispatches
     * through here; that transport enforces via `policies/scoped-service.ts`,
     * and reads this only to say up front what it would refuse.
     */
    permission: string | null;
    /** True when `permission` is null because the method derives it from the input. */
    permissionDynamic: boolean;
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};
