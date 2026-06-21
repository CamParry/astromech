/**
 * Method Manifest Generator
 *
 * Produces a JSON catalogue of every service-method descriptor: core domain
 * methods (users, media, settings), per-type entry methods, and plugin SDK
 * methods. Pure function — callers are responsible for writing the result to
 * disk or injecting it into a virtual module.
 *
 * Schema version: 1
 */

import { z } from '@hono/zod-openapi';
import type {
    PluginDefinition,
    AnyPluginSdkMethod,
    PluginAccess,
} from '@/types/index.js';
import type { ResolvedConfig } from '@/types/index.js';
import { usersDescriptors } from '@/users/descriptors.js';
import { mediaDescriptors } from '@/media/descriptors.js';
import { settingsDescriptors } from '@/settings/descriptors.js';
import {
    type EntryAction,
    rootEntryPermission,
    pluginEntryPermission,
} from '@/permissions/entry-permission.js';
import {
    resolvePluginIdentity,
    resolvePluginPermission,
} from '@/plugins/runtime/plugin-identity.js';

/**
 * Filename of the emitted manifest (lands in the project's `.astro/` dir).
 * Shared by the Astro integration hook and the `generate:manifest` CLI command
 * so the two emitters can never drift on the path.
 */
export const METHOD_MANIFEST_FILENAME = 'astromech.methods.json';

// ============================================================================
// Manifest shape
// ============================================================================

/**
 * A single entry in the methods array. `source` discriminates the three origin
 * groups; optional fields apply only to specific sources.
 */
type ManifestMethod = {
    /** Dotted method identifier, e.g. `users.create`, `entries.get`, `plugins.redirects.lookup`. */
    name: string;
    /** One-line human summary. */
    summary?: string | undefined;
    /** Origin group. */
    source: 'core' | 'entries' | 'plugin';
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
    /** JSON Schema for the call input (null when schema extraction failed). */
    input?: unknown;
    /** JSON Schema for the call output (null when schema extraction failed). */
    output?: unknown;
    // ── entries-specific ──────────────────────────────────────────────────
    /** Bare wire type (e.g. `posts`). Present when `source === 'entries'`. */
    entryType?: string;
    /**
     * `'root'` for root-mounted types, or the plugin's permissionNamespace for
     * plugin-mounted types. Present when `source === 'entries'`.
     */
    mount?: string;
    /** Plugin name this entry type belongs to. Present for plugin-mounted entries. */
    plugin?: string;
    /**
     * Entry content schema (reserved for a future field-level schema; null for now).
     * Present when `source === 'entries'`.
     */
    contentSchema?: null;
    // ── plugin SDK method-specific ────────────────────────────────────────
    /**
     * Normalised access level. Present when `source === 'plugin'`.
     * `'permission'` means an object form with a concrete permission string.
     */
    access?: 'public' | 'authenticated' | 'permission';
    /**
     * True when `mutates` is a default (the plugin method did not declare it).
     * Consumers should treat the default conservatively. Present when
     * `source === 'plugin'`.
     */
    effectDeclared?: boolean;
};

type MethodManifest = {
    version: 1;
    methods: ManifestMethod[];
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a Zod schema to a JSON Schema object. Returns null on any error so
 * a single broken schema does not abort the whole manifest.
 */
function toJSONSchema(schema: z.ZodType): unknown {
    try {
        return z.toJSONSchema(schema, { unrepresentable: 'any' });
    } catch {
        return null;
    }
}

/**
 * Entry method/action pairs. Order matches the logical CRUD+publish sequence,
 * then the forward-versioning (staged entries) methods. `requires` gates a
 * method on a capability: `publish` needs `versioning`; the staging/preview
 * methods need `staging` (the action they enforce against is separate — e.g.
 * `mergeStaged` enforces `publish` but is gated on `staging`).
 */
const ENTRY_METHODS: {
    method: string;
    action: EntryAction;
    idempotent?: boolean;
    requires?: 'versioning' | 'staging';
}[] = [
    { method: 'query', action: 'read' },
    { method: 'get', action: 'read' },
    { method: 'create', action: 'create' },
    // Re-applying the same update lands the same end-state — matches the core
    // `users.update`/`settings.set` idempotent hint (ai-integration §3.6).
    { method: 'update', action: 'update', idempotent: true },
    { method: 'delete', action: 'delete' },
    { method: 'publish', action: 'publish', requires: 'versioning' },
    { method: 'createStaged', action: 'update', requires: 'staging' },
    { method: 'getStaged', action: 'read', requires: 'staging' },
    { method: 'mergeStaged', action: 'publish', requires: 'staging' },
    { method: 'deleteStaged', action: 'update', requires: 'staging' },
    { method: 'issuePreviewToken', action: 'update', requires: 'staging' },
    { method: 'revokePreviewToken', action: 'update', requires: 'staging' },
];

/**
 * Human-readable summary for a generated entry method.
 * e.g. method='query', type='posts' → 'List "posts" entries.'
 */
function entryMethodSummary(method: string, action: EntryAction, type: string): string {
    switch (method) {
        case 'query':
            return `List "${type}" entries.`;
        case 'createStaged':
            return `Stage a change to a "${type}" entry.`;
        case 'getStaged':
            return `Get the staged change of a "${type}" entry.`;
        case 'mergeStaged':
            return `Merge the staged change into a "${type}" entry.`;
        case 'deleteStaged':
            return `Discard the staged change of a "${type}" entry.`;
        case 'issuePreviewToken':
            return `Issue a preview token for a "${type}" entry.`;
        case 'revokePreviewToken':
            return `Revoke the preview token of a "${type}" entry.`;
    }
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    return `${verb} a "${type}" entry.`;
}

/** Whether a method's capability requirement is met for an entry type's caps. */
function methodCapabilityMet(
    requires: 'versioning' | 'staging' | undefined,
    capabilities: { versioning: boolean; staging: boolean }
): boolean {
    if (requires === 'versioning') return capabilities.versioning;
    if (requires === 'staging') return capabilities.staging;
    return true;
}

// ============================================================================
// Core descriptors group
// ============================================================================

function buildCoreMethods(): ManifestMethod[] {
    const catalogues = [usersDescriptors, mediaDescriptors, settingsDescriptors] as const;
    const methods: ManifestMethod[] = [];

    for (const catalogue of catalogues) {
        for (const descriptor of Object.values(catalogue)) {
            const method: ManifestMethod = {
                name: descriptor.name ?? '(unnamed)',
                summary: descriptor.summary,
                source: 'core',
                permission:
                    typeof descriptor.permission === 'string'
                        ? descriptor.permission
                        : null,
                mutates: descriptor.mutates,
                destructive: descriptor.destructive ?? false,
                idempotent: descriptor.idempotent ?? false,
            };

            // Flag function-form permissions — they cannot be statically serialised.
            if (typeof descriptor.permission === 'function') {
                method.permissionDynamic = true;
            }

            if (descriptor.input) {
                method.input = toJSONSchema(descriptor.input);
            }
            if (descriptor.output) {
                method.output = toJSONSchema(descriptor.output);
            }

            methods.push(method);
        }
    }

    return methods;
}

// ============================================================================
// Entries group
// ============================================================================

function buildEntriesMethods(
    config: ResolvedConfig,
    plugins: PluginDefinition[]
): ManifestMethod[] {
    const methods: ManifestMethod[] = [];

    // Build plugin name → permissionNamespace map for plugin entry types.
    const pluginNsMap = new Map<string, string>();
    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        pluginNsMap.set(identity.name, identity.permissionNamespace);
    }

    // Root entry types
    for (const [type, cfg] of Object.entries(config.entries)) {
        for (const { method, action, idempotent, requires } of ENTRY_METHODS) {
            // Gate capability-bound methods: `publish` needs versioning; the
            // staged-entry/preview methods need the `staging` capability.
            if (!methodCapabilityMet(requires, cfg.capabilities)) {
                continue;
            }

            methods.push({
                name: `entries.${method}`,
                summary: entryMethodSummary(method, action, type),
                source: 'entries',
                entryType: type,
                mount: 'root',
                permission: rootEntryPermission(type, action),
                mutates: action !== 'read',
                destructive: action === 'delete',
                idempotent: idempotent ?? false,
                contentSchema: null,
            });
        }
    }

    // Plugin entry types
    for (const [pluginName, types] of Object.entries(config.pluginEntries)) {
        const permissionNamespace = pluginNsMap.get(pluginName) ?? pluginName;
        for (const [type, cfg] of Object.entries(types)) {
            for (const { method, action, idempotent, requires } of ENTRY_METHODS) {
                // Same capability gating as root entry types.
                if (!methodCapabilityMet(requires, cfg.capabilities)) {
                    continue;
                }

                methods.push({
                    name: `entries.${method}`,
                    summary: entryMethodSummary(method, action, type),
                    source: 'entries',
                    entryType: type,
                    mount: permissionNamespace,
                    plugin: pluginName,
                    permission: pluginEntryPermission(permissionNamespace, type, action),
                    mutates: action !== 'read',
                    destructive: action === 'delete',
                    idempotent: idempotent ?? false,
                    contentSchema: null,
                });
            }
        }
    }

    return methods;
}

// ============================================================================
// Plugin SDK methods group
// ============================================================================

function normaliseAccess(
    access: PluginAccess
): 'public' | 'authenticated' | 'permission' {
    if (typeof access === 'object') return 'permission';
    return access;
}

function buildPluginSdkMethods(plugins: PluginDefinition[]): ManifestMethod[] {
    const methods: ManifestMethod[] = [];

    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        for (const [key, m] of Object.entries(def.sdk ?? {})) {
            const sdkMethod = m as AnyPluginSdkMethod;
            const method: ManifestMethod = {
                name: `plugins.${identity.name}.${key}`,
                summary: sdkMethod.summary,
                source: 'plugin',
                plugin: identity.name,
                access: normaliseAccess(sdkMethod.access),
                // Mirror the route's enforcement: bare keys are plugin-scoped
                // (`view` → `plugin:<ns>:view`); keys with a `:` pass through.
                permission:
                    typeof sdkMethod.access === 'object'
                        ? resolvePluginPermission(
                              identity.permissionNamespace,
                              sdkMethod.access.permission
                          )
                        : null,
                // Default to mutating when undeclared — fail-safe for the future confirm gate.
                mutates: sdkMethod.mutates ?? true,
                destructive: sdkMethod.destructive ?? false,
                idempotent: sdkMethod.idempotent ?? false,
                effectDeclared: sdkMethod.mutates !== undefined,
            };
            methods.push(method);
        }
    }

    return methods;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a JSON method manifest string cataloguing every service method in
 * the resolved config. Returns the JSON as a string (including a trailing
 * newline) — the caller writes it to disk or serves it from a virtual module.
 */
export function generateMethodManifest(
    config: ResolvedConfig,
    plugins: PluginDefinition[] = []
): string {
    const methods: ManifestMethod[] = [
        ...buildCoreMethods(),
        ...buildEntriesMethods(config, plugins),
        ...buildPluginSdkMethods(plugins),
    ];

    // Stable output: sort by method name (ties broken by entryType then plugin).
    methods.sort((a, b) => {
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0) return nameCmp;
        const typeCmp = (a.entryType ?? '').localeCompare(b.entryType ?? '');
        if (typeCmp !== 0) return typeCmp;
        return (a.plugin ?? '').localeCompare(b.plugin ?? '');
    });

    const manifest: MethodManifest = { version: 1, methods };
    return JSON.stringify(manifest, null, 2) + '\n';
}
