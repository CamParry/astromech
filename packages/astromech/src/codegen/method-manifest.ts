/**
 * Method Manifest Generator
 *
 * Produces a JSON catalogue of every service-method descriptor: core domain
 * methods (users, media, settings), per-type entry methods, and plugin service
 * methods. Pure function — callers are responsible for writing the result to
 * disk or injecting it into a virtual module.
 *
 * Every schema is authored in the domain that owns the method; this file only
 * projects descriptors into the manifest shape. A method's `input` is its
 * ARGUMENT object, not the HTTP body.
 *
 * Schema version: 2
 */

import { z } from '@hono/zod-openapi';
import type {
    PluginDefinition,
    AnyPluginServiceMethod,
    PluginAccess,
    ServiceMethodDescriptor,
} from '@/types/index.js';
import type { ResolvedConfig } from '@/types/index.js';
import { usersDescriptors } from '@/users/descriptors.js';
import { mediaDescriptors } from '@/media/descriptors.js';
import { settingsDescriptors } from '@/settings/descriptors.js';
import {
    entryMethodDescriptors,
    type EntryMethodDescriptor,
} from '@/entries/descriptors.js';
import { qualifyEntryType } from '@/entries/type-registry.js';
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
    // ── plugin service method-specific ────────────────────────────────────
    /**
     * Normalised access level. Present when `source === 'plugin'`.
     * `'permission'` means an object form with a concrete permission string.
     */
    access?: 'public' | 'authenticated' | 'permission';
};

type MethodManifest = {
    version: 2;
    methods: ManifestMethod[];
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a Zod schema to a JSON Schema object. Returns null on any error so
 * a single broken schema does not abort the whole manifest.
 *
 * `io` must match which side of a transforming schema is being described. A
 * descriptor's `input` is what the caller passes IN, so a `z.string().datetime()`
 * that transforms to a `Date` has to render as the string — Zod's default
 * (`'output'`) renders the `Date`, which is unrepresentable and degrades to `{}`,
 * telling an AI consumer nothing about what to send.
 */
function toJSONSchema(schema: z.ZodType, io: 'input' | 'output'): unknown {
    try {
        return z.toJSONSchema(schema, { unrepresentable: 'any', io });
    } catch {
        return null;
    }
}

/**
 * A descriptor's statically-serialisable permission. Function-form permissions
 * resolve from the call input, so they cannot go in the manifest as a string —
 * `permissionDynamic` flags them instead.
 */
function staticPermission(descriptor: ServiceMethodDescriptor): string | null {
    return typeof descriptor.permission === 'string' ? descriptor.permission : null;
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
    // The domain prefix is paired with the catalogue here, so a method's name is
    // its position (`users.query`) rather than a hand-written string that can
    // drift from the key it sits under.
    const catalogues: [string, Record<string, ServiceMethodDescriptor>][] = [
        ['users', usersDescriptors],
        ['media', mediaDescriptors],
        ['settings', settingsDescriptors],
    ];
    const methods: ManifestMethod[] = [];

    for (const [domain, catalogue] of catalogues) {
        for (const [key, descriptor] of Object.entries(catalogue)) {
            const method: ManifestMethod = {
                name: `${domain}.${key}`,
                summary: descriptor.summary,
                source: 'core',
                permission: staticPermission(descriptor),
                mutates: descriptor.mutates,
                destructive: descriptor.destructive ?? false,
                idempotent: descriptor.idempotent ?? false,
            };

            // Flag function-form permissions — they cannot be statically serialised.
            if (typeof descriptor.permission === 'function') {
                method.permissionDynamic = true;
            }

            if (descriptor.input) {
                method.input = toJSONSchema(descriptor.input, 'input');
            }
            if (descriptor.output) {
                method.output = toJSONSchema(descriptor.output, 'output');
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
        pluginNsMap.set(identity.namespace, identity.permissionNamespace);
    }

    // Root entry types — addressed by their bare id.
    for (const [type, cfg] of Object.entries(config.entries)) {
        for (const descriptor of entryMethodDescriptors({
            typeId: type,
            titleField: cfg.titleField,
        })) {
            // Gate capability-bound methods: `publish` needs versioning; the
            // staged-entry/preview methods need the `staging` capability.
            if (!methodCapabilityMet(descriptor.requires, cfg.capabilities)) {
                continue;
            }

            methods.push({
                ...projectEntryMethod(descriptor),
                entryType: type,
                mount: 'root',
            });
        }
    }

    // Plugin entry types — addressed by their qualified id (`<namespace>/<type>`).
    for (const [pluginName, types] of Object.entries(config.pluginEntries)) {
        const permissionNamespace = pluginNsMap.get(pluginName) ?? pluginName;
        for (const [type, cfg] of Object.entries(types)) {
            for (const descriptor of entryMethodDescriptors({
                typeId: qualifyEntryType(pluginName, type),
                titleField: cfg.titleField,
            })) {
                // Same capability gating as root entry types.
                if (!methodCapabilityMet(descriptor.requires, cfg.capabilities)) {
                    continue;
                }

                methods.push({
                    ...projectEntryMethod(descriptor),
                    entryType: type,
                    mount: permissionNamespace,
                    plugin: pluginName,
                });
            }
        }
    }

    return methods;
}

/** The type-independent half of an entry method's manifest entry. */
function projectEntryMethod(descriptor: EntryMethodDescriptor): ManifestMethod {
    const method: ManifestMethod = {
        name: `entries.${descriptor.method}`,
        summary: descriptor.summary,
        source: 'entries',
        permission: staticPermission(descriptor),
        mutates: descriptor.mutates,
        destructive: descriptor.destructive ?? false,
        idempotent: descriptor.idempotent ?? false,
    };
    if (descriptor.input) {
        method.input = toJSONSchema(descriptor.input, 'input');
    }
    return method;
}

// ============================================================================
// Plugin service methods group
// ============================================================================

function normaliseAccess(
    access: PluginAccess
): 'public' | 'authenticated' | 'permission' {
    if (typeof access === 'object') return 'permission';
    return access;
}

function buildPluginServiceMethods(plugins: PluginDefinition[]): ManifestMethod[] {
    const methods: ManifestMethod[] = [];

    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        for (const [key, m] of Object.entries(def.service ?? {})) {
            const serviceMethod = m as AnyPluginServiceMethod;
            const method: ManifestMethod = {
                name: `plugins.${identity.serviceKey}.${key}`,
                summary: serviceMethod.summary,
                source: 'plugin',
                plugin: identity.namespace,
                access: normaliseAccess(serviceMethod.access),
                // Mirror the route's enforcement: bare keys are plugin-scoped
                // (`view` → `plugin:<ns>:view`); keys with a `:` pass through.
                permission:
                    typeof serviceMethod.access === 'object'
                        ? resolvePluginPermission(
                              identity.permissionNamespace,
                              serviceMethod.access.permission
                          )
                        : null,
                mutates: serviceMethod.mutates,
                destructive: serviceMethod.destructive ?? false,
                idempotent: serviceMethod.idempotent ?? false,
            };

            if (serviceMethod.input) {
                method.input = toJSONSchema(serviceMethod.input, 'input');
            }
            if (serviceMethod.output) {
                method.output = toJSONSchema(serviceMethod.output, 'output');
            }

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
        ...buildPluginServiceMethods(plugins),
    ];

    // Stable output: sort by method name (ties broken by entryType then plugin).
    methods.sort((a, b) => {
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0) return nameCmp;
        const typeCmp = (a.entryType ?? '').localeCompare(b.entryType ?? '');
        if (typeCmp !== 0) return typeCmp;
        return (a.plugin ?? '').localeCompare(b.plugin ?? '');
    });

    const manifest: MethodManifest = { version: 2, methods };
    return JSON.stringify(manifest, null, 2) + '\n';
}
