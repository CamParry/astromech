/**
 * Produces a JSON catalogue of every service-method contract: core domain
 * methods, per-type entry methods, and plugin service methods. Pure
 * function — a method's `input` is its ARGUMENT object, not the HTTP body.
 */
import type { Capability } from '@/entries/capabilities';
import type { EntryMethodContract } from '@/entries/methods';
import type {
    AnyServiceMethod,
    CoreManifestMethod,
    EntriesManifestMethod,
    JsonSchemaObject,
    ManifestAccess,
    ManifestMethod,
    MethodManifest,
    PluginAccess,
    PluginDefinition,
    PluginManifestMethod,
    ResolvedConfig,
    ResolvedEntryCapabilities,
    ServiceMethodContract,
} from '@/types/index';
import { z } from '@hono/zod-openapi';
import { qualifyEntryType } from '@/entries/entry-types.shared';
import { entryMethodContracts } from '@/entries/methods';
import { globalsContract } from '@/globals/contract';
import { mediaContract } from '@/media/contract';
import { notificationsContract } from '@/notifications/contract';
import {
    resolvePluginIdentity,
    resolvePluginPermission,
} from '@/plugins/runtime/plugin-identity';
import { settingsContract } from '@/settings/contract';
import { usersContract } from '@/users/contract';

/**
 * Filename of the emitted manifest (lands in the project's `.astro/` dir).
 * Shared by the Astro integration hook and the `generate:manifest` CLI command
 * so the two emitters can never drift on the path.
 */
export const METHOD_MANIFEST_FILENAME = 'astromech.methods.json';

/**
 * Convert a Zod schema to a JSON Schema object. Returns null on any error so
 * a single broken schema does not abort the whole manifest. `io` must match
 * which side of a transforming schema is being described (input vs output).
 */
function toJSONSchema(
    schema: z.ZodType,
    io: 'input' | 'output'
): JsonSchemaObject | null {
    try {
        return z.toJSONSchema(schema, { unrepresentable: 'any', io });
    } catch {
        return null;
    }
}

/**
 * A contract's statically-serialisable permission. Function-form permissions
 * resolve from the call input, so they cannot go in the manifest as a string —
 * `permissionDynamic` flags them instead.
 */
function staticPermission(contract: ServiceMethodContract): string | null {
    return typeof contract.permission === 'string' ? contract.permission : null;
}

/**
 * Whether a method's capability requirement is met for an entry type's caps.
 * Reads the capability by name rather than branching per capability, so adding
 * one to `Capability` cannot silently leave a method ungated here.
 */
function methodCapabilityMet(
    requires: Capability | undefined,
    capabilities: ResolvedEntryCapabilities
): boolean {
    return requires === undefined || capabilities[requires];
}

function buildCoreMethods(): CoreManifestMethod[] {
    // The module prefix is paired with the catalogue here, so a method's name is
    // its position (`users.query`) rather than a hand-written string that can
    // drift from the key it sits under.
    const catalogues: [string, Record<string, ServiceMethodContract>][] = [
        ['users', usersContract],
        ['media', mediaContract],
        ['settings', settingsContract],
        ['globals', globalsContract],
        ['notifications', notificationsContract],
    ];
    const methods: CoreManifestMethod[] = [];

    for (const [module, catalogue] of catalogues) {
        for (const [key, contract] of Object.entries(catalogue)) {
            const method: CoreManifestMethod = {
                // A core module has one method per key, so the name is already
                // unique — id and name coincide.
                id: `${module}.${key}`,
                name: `${module}.${key}`,
                summary: contract.summary,
                source: 'core',
                module,
                method: key,
                permission: staticPermission(contract),
                mutates: contract.mutates,
                destructive: contract.destructive ?? false,
                idempotent: contract.idempotent ?? false,
            };

            // Flag function-form permissions — they cannot be statically serialised.
            if (typeof contract.permission === 'function') {
                method.permissionDynamic = true;
            }

            if (contract.input) {
                method.input = toJSONSchema(contract.input, 'input');
            }
            if (contract.output) {
                method.output = toJSONSchema(contract.output, 'output');
            }
            // Emitted only when true — a JSON-RPC transport reads this to skip a
            // method whose schema renders as callable but whose input is a File.
            if (contract.binaryInput === true) {
                method.binaryInput = true;
            }
            // Also only when true: the method's `userId` comes from the session,
            // so a transport with no signed-in user cannot call it.
            if (contract.sessionScoped === true) {
                method.sessionScoped = true;
            }

            methods.push(method);
        }
    }

    return methods;
}

function buildEntriesMethods(
    config: ResolvedConfig,
    plugins: PluginDefinition[]
): EntriesManifestMethod[] {
    const methods: EntriesManifestMethod[] = [];

    // Build plugin name → permissionNamespace map for plugin entry types.
    const pluginNsMap = new Map<string, string>();
    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        pluginNsMap.set(identity.namespace, identity.permissionNamespace);
    }

    // Root entry types — addressed by their bare id.
    for (const [type, entryType] of Object.entries(config.entries)) {
        for (const contract of entryMethodContracts({
            typeId: type,
            titled: entryType.titleField !== false,
        })) {
            // Gate capability-bound methods: `publish` needs versioning; the
            // staged-entry/preview methods need the `staging` capability.
            if (!methodCapabilityMet(contract.requires, entryType.capabilities)) {
                continue;
            }

            methods.push(
                projectEntryMethod(contract, {
                    typeId: type,
                    entryType: type,
                    namespace: 'root',
                })
            );
        }
    }

    // Plugin entry types — addressed by their qualified id (`<namespace>/<type>`).
    for (const [pluginName, types] of Object.entries(config.pluginEntries)) {
        const permissionNamespace = pluginNsMap.get(pluginName) ?? pluginName;
        for (const [type, entryType] of Object.entries(types)) {
            const typeId = qualifyEntryType(pluginName, type);
            for (const contract of entryMethodContracts({
                typeId,
                titled: entryType.titleField !== false,
            })) {
                // Same capability gating as root entry types.
                if (!methodCapabilityMet(contract.requires, entryType.capabilities)) {
                    continue;
                }

                methods.push(
                    projectEntryMethod(contract, {
                        typeId,
                        entryType: type,
                        namespace: permissionNamespace,
                        plugin: pluginName,
                    })
                );
            }
        }
    }

    return methods;
}

/**
 * Project one entry method for one type. The id carries the type id — the
 * dimension `name` lacks, since `entries.create` names every type's create.
 */
function projectEntryMethod(
    contract: EntryMethodContract,
    placement: {
        typeId: string;
        entryType: string;
        namespace: string;
        plugin?: string;
    }
): EntriesManifestMethod {
    const method: EntriesManifestMethod = {
        id: `entries.${placement.typeId}.${contract.method}`,
        name: `entries.${contract.method}`,
        summary: contract.summary,
        source: 'entries',
        method: contract.method,
        typeId: placement.typeId,
        entryType: placement.entryType,
        namespace: placement.namespace,
        permission: staticPermission(contract),
        mutates: contract.mutates,
        destructive: contract.destructive ?? false,
        idempotent: contract.idempotent ?? false,
    };
    if (placement.plugin !== undefined) {
        method.plugin = placement.plugin;
    }
    if (contract.input) {
        method.input = toJSONSchema(contract.input, 'input');
    }
    return method;
}

function normaliseAccess(access: PluginAccess): ManifestAccess {
    if (typeof access === 'object') return 'permission';
    return access;
}

function buildPluginServiceMethods(plugins: PluginDefinition[]): PluginManifestMethod[] {
    const methods: PluginManifestMethod[] = [];

    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        for (const [key, m] of Object.entries(def.service ?? {})) {
            const serviceMethod = m as AnyServiceMethod;
            const method: PluginManifestMethod = {
                // Service keys are collision-checked at boot, so the name is
                // already unique — id and name coincide.
                id: `plugins.${identity.serviceKey}.${key}`,
                name: `plugins.${identity.serviceKey}.${key}`,
                summary: serviceMethod.summary,
                source: 'plugin',
                plugin: identity.namespace,
                serviceKey: identity.serviceKey,
                method: key,
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

/**
 * Catalogue every service method in the resolved config. Callers that write the
 * manifest to disk serialise it with `serialiseMethodManifest`; the rest read
 * the structure directly.
 */
export function generateMethodManifest(
    config: ResolvedConfig,
    plugins: PluginDefinition[] = []
): MethodManifest {
    const methods: ManifestMethod[] = [
        ...buildCoreMethods(),
        ...buildEntriesMethods(config, plugins),
        ...buildPluginServiceMethods(plugins),
    ];

    // Stable output: `id` is unique, so sorting by it is a TOTAL order. Compared
    // by code unit, not `localeCompare` (locale/ICU dependent) — the MCP tool
    // list renders at prompt position 0, so a reorder would bust the prompt cache.
    methods.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return { version: 3, methods };
}

/**
 * The manifest as the file both emitters write: the Astro integration hook and
 * the `generate:manifest` CLI command, byte for byte the same.
 */
export function serialiseMethodManifest(manifest: MethodManifest): string {
    return JSON.stringify(manifest, null, 2) + '\n';
}
