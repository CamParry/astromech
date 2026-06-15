/**
 * Settings visibility helpers.
 *
 * Determines whether a setting key is publicly readable based on the
 * `publicSettingKeys` list derived from `ResolvedConfig`.
 *
 * No DB access, no virtual-module imports — pure, testable logic.
 */

/**
 * Test whether a setting `key` is publicly readable according to
 * `publicSettingKeys`.
 *
 * A key is public when it:
 *   - exactly matches an entry in `publicSettingKeys`, OR
 *   - matches a prefix entry ending with `':'` (covers per-locale variants
 *     such as `'globals:en'` when `'globals:'` is in the list).
 */
export function isPublicSettingKey(key: string, publicKeys: string[]): boolean {
    for (const entry of publicKeys) {
        if (entry.endsWith(':')) {
            if (key.startsWith(entry)) return true;
        } else {
            if (key === entry) return true;
        }
    }
    return false;
}
