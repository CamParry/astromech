/**
 * Deriving the set of publicly-readable setting keys from the author's
 * `publicSettings` list.
 */

/**
 * Each bare entry contributes both an exact key and a `key:` prefix, so a
 * per-locale variant is exposed too. An entry already a prefix (ends with `:`)
 * is taken as written.
 */
export function resolvePublicSettingKeys(
    publicSettings: readonly string[] | undefined
): string[] {
    const keys: string[] = [];

    const addKey = (key: string): void => {
        if (!keys.includes(key)) keys.push(key);
    };

    for (const key of publicSettings ?? []) {
        if (key.endsWith(':')) {
            addKey(key);
        } else {
            addKey(key);
            addKey(`${key}:`);
        }
    }

    return keys;
}
