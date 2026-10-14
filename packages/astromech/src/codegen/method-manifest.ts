/**
 * Produces a JSON catalogue of every service-method contract: core domain
 * methods, per-type entry methods, and plugin service methods. Pure
 * function — a method's `input` is its ARGUMENT object, not the HTTP body.
 */
import type {
    AccessRule,
    CoreManifestMethod,
    EntriesManifestMethod,
    JsonSchemaObject,
    ManifestMethod,
    ManifestMethodAccess,
    MethodManifest,
    PluginDefinition,
    PluginManifestMethod,
    ResolvedConfig,
    ResolvedEntryType,
    ServiceMethodContract,
} from '@/types/index';
import type { z } from '@hono/zod-openapi';
import { availableEntryMethods } from '@/entries/catalogue';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition } from '@/notifications/service';
import { resolveAccess } from '@/permissions/access';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { securityDefinition } from '@/security/service';
import { toJsonSchema } from '@/services/json-schema';
import { usersDefinition } from '@/users/service';

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
        return toJsonSchema(schema, { io });
    } catch {
        return null;
    }
}

/**
 * What `access` demands, as the manifest records it. `call` is the input that
 * fixes the method's target, when its id fixes one (an entry method's type): a
 * function form is resolved against it. With no call, a function form's
 * permission depends on an input the manifest does not have, so it is dynamic.
 * `namespace` resolves a plugin's `{ permission }` form.
 */
function describeAccess(
    access: AccessRule<never>,
    call: { input: unknown } | null,
    namespace?: string
): ManifestMethodAccess {
    if (typeof access === 'function' && call === null) {
        return { access: 'permission', permissions: [], dynamic: true };
    }
    const resolved = resolveAccess(access, call?.input, namespace);
    return {
        access: resolved.kind,
        permissions: resolved.kind === 'permission' ? [...resolved.permissions] : [],
        dynamic: false,
    };
}

function buildCoreMethods(): CoreManifestMethod[] {
    // The module prefix is paired with the catalogue here, so a method's name is
    // its position (`users.query`) rather than a hand-written string that can
    // drift from the key it sits under.
    const catalogues: [string, Record<string, ServiceMethodContract>][] = [
        ['users', usersDefinition.catalogue],
        ['media', mediaDefinition.catalogue],
        ['globals', globalsDefinition.catalogue],
        ['notifications', notificationsDefinition.catalogue],
        ['security', securityDefinition.catalogue],
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
                // A core module's method names no target in its id, so a
                // function form (every `globals` method's) is dynamic.
                ...describeAccess(contract.access, null),
                mutates: contract.mutates,
                destructive: contract.destructive ?? false,
                idempotent: contract.idempotent ?? false,
            };

            method.input = toJSONSchema(contract.input, 'input');
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

function buildEntriesMethods(config: ResolvedConfig): EntriesManifestMethod[] {
    const methods: EntriesManifestMethod[] = [];

    for (const entryType of Object.values(config.entryTypes)) {
        for (const [name, contract] of Object.entries(availableEntryMethods(entryType))) {
            methods.push(projectEntryMethod(contract, name, entryType));
        }
    }

    return methods;
}

/**
 * Project one entry method for one type. The id carries the type id — the
 * dimension `name` lacks, since `entries.create` names every type's create.
 */
function projectEntryMethod(
    contract: ServiceMethodContract,
    name: string,
    entryType: ResolvedEntryType
): EntriesManifestMethod {
    const method: EntriesManifestMethod = {
        id: `entries.${entryType.id}.${name}`,
        name: `entries.${name}`,
        summary: contract.summary,
        source: 'entries',
        method: name,
        typeId: entryType.id,
        // The id fixes the type, so the rule resolves for a call naming it.
        ...describeAccess(contract.access, { input: { type: entryType.id } }),
        mutates: contract.mutates,
        destructive: contract.destructive ?? false,
        idempotent: contract.idempotent ?? false,
    };
    if (entryType.plugin !== undefined) {
        method.plugin = entryType.plugin;
    }
    method.input = toJSONSchema(contract.input, 'input');
    if (contract.output) {
        method.output = toJSONSchema(contract.output, 'output');
    }
    return method;
}

function buildPluginServiceMethods(plugins: PluginDefinition[]): PluginManifestMethod[] {
    const methods: PluginManifestMethod[] = [];

    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        for (const [key, m] of Object.entries(def.service ?? {})) {
            const serviceMethod = m;
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
                // Resolved as the scoped handle resolves it: a bare key is
                // plugin-scoped (`read` to `plugin:<ns>:read`), a key with a `:`
                // passes through.
                ...describeAccess(
                    serviceMethod.access,
                    null,
                    identity.permissionNamespace
                ),
                mutates: serviceMethod.mutates,
                destructive: serviceMethod.destructive ?? false,
                idempotent: serviceMethod.idempotent ?? false,
            };

            method.input = toJSONSchema(serviceMethod.input, 'input');
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
        ...buildEntriesMethods(config),
        ...buildPluginServiceMethods(plugins),
    ];

    // Stable output: `id` is unique, so sorting by it is a TOTAL order. Compared
    // by code unit, not `localeCompare` (locale/ICU dependent) — the MCP tool
    // list renders at prompt position 0, so a reorder would bust the prompt cache.
    methods.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return { version: 4, methods };
}

/**
 * The manifest as the file both emitters write: the Astro integration hook and
 * the `generate:manifest` CLI command, byte for byte the same.
 */
export function serialiseMethodManifest(manifest: MethodManifest): string {
    return JSON.stringify(manifest, null, 2) + '\n';
}
