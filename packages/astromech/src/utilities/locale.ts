/**
 * Locale-tag utilities (BCP-47 / RFC 4647 "lookup"). Bridges the admin's
 * display locale (`en-GB`) to a content locale entries are tagged with
 * (`en`), resolving down the display tag's fallback chain.
 */

import type { ResolvedConfig } from '@/types/index';

/** RFC 4647 lookup chain: `'en-GB'` → `['en-GB','en']`. */
function localeFallbackChain(tag: string): string[] {
    const parts = tag.split('-').filter(Boolean);
    const chain: string[] = [];
    for (let i = parts.length; i > 0; i--) {
        chain.push(parts.slice(0, i).join('-'));
    }
    return chain;
}

/**
 * Resolve a requested tag to the closest member of `available` via RFC 4647
 * lookup (try the tag, then each truncation). `undefined` when none match.
 */
export function resolveContentLocale(
    requested: string,
    available: readonly string[]
): string | undefined {
    for (const candidate of localeFallbackChain(requested)) {
        if (available.includes(candidate)) return candidate;
    }
    return undefined;
}

/**
 * The content locale rows are tagged with by default, reached by walking
 * `defaultLocale` down its RFC 4647 fallback chain.
 */
export function defaultContentLocale(
    config: Pick<ResolvedConfig, 'locales' | 'defaultLocale'>
): string {
    // `defaultLocale` is a display tag (e.g. `en-GB`) and the repository matches
    // locale exactly, so fall back to the first configured locale.
    const locales = config.locales ?? [];
    const requested = config.defaultLocale ?? 'en';
    return resolveContentLocale(requested, locales) ?? locales[0] ?? requested;
}
