/**
 * Entry capability resolution and boot-time validation.
 */

import type { EntryTypeConfig, ResolvedEntryCapabilities } from '@/types/index.js';

export type Capability =
    | 'statuses'
    | 'slug'
    | 'translatable'
    | 'versioning'
    | 'trash'
    | 'staging';

/** All capabilities supported by built-in storage. */
export const BUILT_IN_SUPPORTS: readonly Capability[] = [
    'statuses',
    'slug',
    'translatable',
    'versioning',
    'trash',
    'staging',
];

/**
 * Resolve the capability set for an entry type.
 *
 * When storage supports a capability, the config default applies.
 * When storage does NOT support a capability and the user has not explicitly
 * requested it, the capability defaults to false (Phase 3: narrower sets).
 */
export function resolveEntryCapabilities(
    cfg: EntryTypeConfig,
    storageSupports: readonly Capability[]
): ResolvedEntryCapabilities {
    const supports = (cap: Capability): boolean => storageSupports.includes(cap);

    return {
        statuses: supports('statuses') ? (cfg.statuses ?? true) : false,
        slug: supports('slug') ? cfg.slug !== false : false,
        trash: supports('trash') ? (cfg.trash ?? true) : false,
        versioning: supports('versioning') ? Boolean(cfg.versioning) : false,
        staging: supports('staging') ? Boolean(cfg.staging) : false,
        translatable: supports('translatable') ? (cfg.translatable ?? false) : false,
    };
}

/**
 * Crash-loud boot validation for an entry type's capabilities and titleField.
 *
 * (a) Any capability explicitly requested by the config but not in
 *     storageSupports throws with a message mirroring plugin-runtime.ts style.
 * (b) titleField values other than 'title' or false are rejected — custom field
 *     names arrive with custom storage (Phase 3).
 */
export function assertEntryTypeValid(
    typeKey: string,
    cfg: EntryTypeConfig,
    capabilities: ResolvedEntryCapabilities,
    storageSupports: readonly Capability[]
): void {
    // Build list of explicitly-requested capabilities that are unsupported.
    const requested: Capability[] = [];
    if (cfg.statuses === true) requested.push('statuses');
    if (cfg.slug !== undefined && cfg.slug !== false) requested.push('slug');
    if (cfg.trash === true) requested.push('trash');
    if (cfg.versioning) requested.push('versioning');
    if (cfg.staging) requested.push('staging');
    if (cfg.translatable === true) requested.push('translatable');

    const unsupported = requested.filter((cap) => !storageSupports.includes(cap));

    if (unsupported.length > 0) {
        const supportedList =
            storageSupports.length > 0 ? storageSupports.join(', ') : '(none)';
        throw new Error(
            `Astromech entry type "${typeKey}" declares capabilities its storage does not support: ` +
                `${unsupported.join(', ')}. Storage supports: ${supportedList}.`
        );
    }

    // titleField validation — only 'title' or false allowed on built-in storage.
    if (
        cfg.titleField !== undefined &&
        cfg.titleField !== false &&
        cfg.titleField !== 'title'
    ) {
        throw new Error(
            `Astromech entry type "${typeKey}": titleField must be 'title' or false for built-in storage ` +
                `(got "${String(cfg.titleField)}"). Custom title fields arrive with custom storage.`
        );
    }

    void capabilities; // used by callers; parameter kept for symmetry
}
