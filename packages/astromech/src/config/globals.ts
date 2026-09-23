/**
 * Resolving authored globals, the site's and every plugin's, into one map keyed
 * by id: each one's capabilities and field tree, and unique keys per array.
 */

import type {
    AstromechConfig,
    GlobalConfig,
    ResolvedGlobal,
    ResolvedGlobalCapabilities,
} from '@/types/index';
import { toResolvedFields } from '@/config/entry-types';
import { qualifyEntryType } from '@/entries/entry-types';
import { assertUniqueDataNames, validateFieldTree } from '@/fields/field-tree';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

/**
 * Resolve the site's globals under their own keys and each plugin's under
 * `<namespace>/<key>`, into the one map the runtime reads.
 */
export function resolveGlobals(
    config: Pick<AstromechConfig, 'globals' | 'plugins'>
): Record<string, ResolvedGlobal> {
    const resolved: Record<string, ResolvedGlobal> = {};
    const site = config.globals ?? [];
    assertUniqueGlobalKeys('the site config', site);
    for (const global of site) {
        resolved[global.key] = toResolvedGlobal(global.key, global);
    }
    for (const plugin of config.plugins ?? []) {
        const globals = plugin.globals ?? [];
        assertUniqueGlobalKeys(`plugin "${plugin.package}"`, globals);
        const { namespace } = resolvePluginIdentity(plugin);
        for (const global of globals) {
            const id = qualifyEntryType(namespace, global.key);
            resolved[id] = toResolvedGlobal(id, global, namespace);
        }
    }
    return resolved;
}

/** Characters a global key may not contain: both are id separators. */
const GLOBAL_KEY_FORBIDDEN = /[/:]/;

/**
 * Resolve a global's capability set. Globals have one repository, so unlike
 * entry types nothing narrows the defaults.
 */
function toResolvedGlobalCapabilities(config: GlobalConfig): ResolvedGlobalCapabilities {
    return {
        statuses: config.statuses ?? true,
        translatable: config.translatable ?? false,
        versioning: config.versioning === undefined ? true : Boolean(config.versioning),
        staging: Boolean(config.staging),
    };
}

/** Crash-loud validation of one global's key and capability combination. */
function assertGlobalValid(id: string, config: GlobalConfig): void {
    if (config.key === undefined || config.key === '') {
        throw new Error(
            `Astromech global "${id}": every global needs a non-empty \`key\`.`
        );
    }

    if (GLOBAL_KEY_FORBIDDEN.test(config.key)) {
        throw new Error(
            `Astromech global "${id}": key must not contain "/" or ":" (got "${config.key}"). ` +
                `A plugin's global is qualified as "<namespace>/<key>" by Astromech.`
        );
    }

    if (config.staging === true && config.statuses === false) {
        throw new Error(
            `Astromech global "${id}": \`staging\` requires \`statuses\`. ` +
                `A staged change is merged into a status-bearing row.`
        );
    }
}

/**
 * Resolve one global. `id` is the addressable id — the bare key for a host
 * global, `<namespace>/<key>` for a plugin's — and is used in error messages.
 */
export function toResolvedGlobal(
    id: string,
    config: GlobalConfig,
    plugin?: string
): ResolvedGlobal {
    assertGlobalValid(id, config);

    const fields = toResolvedFields(config.fields);
    const owner = `global "${id}"`;
    validateFieldTree(owner, fields.main);
    validateFieldTree(owner, fields.sidebar);
    assertUniqueDataNames(owner, fields);

    const { key: _key, fields: _fields, ...rest } = config;
    return {
        ...rest,
        id,
        ...(plugin !== undefined ? { plugin } : {}),
        fields,
        capabilities: toResolvedGlobalCapabilities(config),
    };
}

/**
 * Reject a key declared twice within one `globals` array. `owner` names where
 * the array came from, e.g. `the site config` or `plugin "@astromech/seo"`.
 */
export function assertUniqueGlobalKeys(owner: string, globals: GlobalConfig[]): void {
    const seen = new Map<string, number>();
    for (const [index, global] of globals.entries()) {
        const first = seen.get(global.key);
        if (first !== undefined) {
            throw new Error(
                `Astromech: ${owner} declares the global key "${global.key}" twice ` +
                    `(globals[${first}] and globals[${index}]). Every key is unique.`
            );
        }
        seen.set(global.key, index);
    }
}
