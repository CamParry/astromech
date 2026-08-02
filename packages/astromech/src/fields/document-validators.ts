/**
 * Document-validator registry.
 *
 * A `validate` function authored on an entry type (or media/users/a settings
 * page) cannot travel through `virtual:astromech/config`: the Astro integration
 * serves that module as `JSON.stringify(resolvedConfig)`, and functions do not
 * survive the round trip. Boot registers the validators here from the LIVE
 * resolved config, before it is serialised, and the write paths look them up by
 * key. Where the config itself is live (the CLI shim, vitest) boot has not run
 * and the caller falls back to the config value.
 *
 * State lives on globalThis (mirrors the entry-storage registry): the package
 * has multiple bundle entry points, so module-level state can be duplicated per
 * chunk — boot would write into one copy while a domain reads another.
 *
 * Keys: `entry:<type>` (qualified `<plugin>/<type>` for a plugin entry type),
 * `media`, `users`, `setting:<page path>`.
 */

import type { DocumentValidator } from '@/types/fields.js';
import type { ResolvedConfig } from '@/types/config.js';

declare global {
    var __astromechDocumentValidators: Map<string, DocumentValidator> | undefined;
}

function registry(): Map<string, DocumentValidator> {
    if (!globalThis.__astromechDocumentValidators) {
        globalThis.__astromechDocumentValidators = new Map<string, DocumentValidator>();
    }
    return globalThis.__astromechDocumentValidators;
}

export function setDocumentValidator(key: string, validator: DocumentValidator): void {
    registry().set(key, validator);
}

export function getDocumentValidator(key: string): DocumentValidator | undefined {
    return registry().get(key);
}

export function resetDocumentValidators(): void {
    registry().clear();
}

/**
 * Register every validator the live resolved config declares. Clears first, so
 * a re-boot (notably in tests) does not leak a previous config's validators.
 * The plugin-entry key matches `qualifyEntryType` — `<plugin>/<type>`, inlined
 * because a capability may not import the entries domain.
 */
export function registerDocumentValidators(resolved: ResolvedConfig): void {
    resetDocumentValidators();

    for (const [type, cfg] of Object.entries(resolved.entries)) {
        if (cfg.validate) setDocumentValidator(`entry:${type}`, cfg.validate);
    }
    for (const [plugin, types] of Object.entries(resolved.pluginEntries)) {
        for (const [type, cfg] of Object.entries(types)) {
            if (cfg.validate)
                setDocumentValidator(`entry:${plugin}/${type}`, cfg.validate);
        }
    }
    if (resolved.media?.validate) setDocumentValidator('media', resolved.media.validate);
    if (resolved.users?.validate) setDocumentValidator('users', resolved.users.validate);
    for (const page of resolved.admin?.pages ?? []) {
        if (page.validate) setDocumentValidator(`setting:${page.path}`, page.validate);
    }
}
