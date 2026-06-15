/**
 * Locale-tag utilities (BCP-47 / RFC 4647 "lookup").
 *
 * Display locale (e.g. `en-GB`) drives admin UI formatting + interface strings;
 * content locales (e.g. `en`, `fr`) are what entries are tagged with and what
 * the API matches exactly. These helpers bridge the two: a display tag resolves
 * down its fallback chain to an available content locale.
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
