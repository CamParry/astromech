/**
 * Settings visibility helpers: whether a setting key is publicly readable,
 * based on the `publicSettingKeys` list from `ResolvedConfig`. Pure — no
 * DB access, no virtual-module imports.
 */

/**
 * Test whether a setting `key` is publicly readable: an exact match in
 * `publicSettingKeys`, or a `':'`-suffixed prefix entry covering per-locale
 * variants like `'globals:en'` under `'globals:'`.
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
