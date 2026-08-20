/**
 * Locale-tag utilities (BCP-47 / RFC 4647 "lookup"). Bridges the admin's
 * display locale (`en-GB`) to a content locale entries are tagged with
 * (`en`), resolving down the display tag's fallback chain.
 */

/** RFC 4647 lookup chain: `'en-GB'` → `['en-GB','en']`. */
export function localeFallbackChain(tag: string): string[] {
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
