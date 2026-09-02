/**
 * Resolving authored globals: each one's capabilities and field tree, and the
 * uniqueness of the keys within one array.
 */

import type {
    GlobalConfig,
    ResolvedGlobal,
    ResolvedGlobalCapabilities,
} from '@/types/index';
import { toResolvedFields } from '@/config/entry-types';
import { assertUniqueDataNames, validateFieldTree } from '@/config/validate/field-tree';

/** Characters a global key may not contain: both are id separators. */
export const GLOBAL_KEY_FORBIDDEN = /[/:]/;

/**
 * Resolve a global's capability set. Globals have one repository, so unlike
 * entry types nothing narrows the defaults.
 */
export function toResolvedGlobalCapabilities(
    config: GlobalConfig
): ResolvedGlobalCapabilities {
    return {
        statuses: config.statuses ?? true,
        translatable: config.translatable ?? false,
        versioning: config.versioning === undefined ? true : Boolean(config.versioning),
        staging: Boolean(config.staging),
    };
}

/** Crash-loud validation of one global's key and capability combination. */
export function assertGlobalValid(id: string, config: GlobalConfig): void {
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
export function toResolvedGlobal(id: string, config: GlobalConfig): ResolvedGlobal {
    assertGlobalValid(id, config);

    const fields = toResolvedFields(config.fields);
    validateFieldTree(id, fields.main, false);
    validateFieldTree(id, fields.sidebar, false);
    assertUniqueDataNames(id, fields);

    const { key: _key, fields: _fields, ...rest } = config;
    return {
        ...rest,
        id,
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

/** Resolve the host config's globals into the keyed map the runtime reads. */
export function resolveGlobals(
    globals: GlobalConfig[] | undefined
): Record<string, ResolvedGlobal> {
    if (globals === undefined) return {};
    assertUniqueGlobalKeys('the site config', globals);

    const resolved: Record<string, ResolvedGlobal> = {};
    for (const global of globals) {
        resolved[global.key] = toResolvedGlobal(global.key, global);
    }
    return resolved;
}
