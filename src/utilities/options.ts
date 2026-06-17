/**
 * Option-merging helper for plugins and config. Merges caller overrides onto a
 * complete defaults object: any key whose override is `undefined` (or absent)
 * keeps the default, so partial option objects never blank out a default.
 */
export function withDefaults<T extends object>(
    defaults: Required<T>,
    options?: Partial<T>
): Required<T> {
    const result = { ...defaults };
    if (!options) return result;
    for (const key of Object.keys(options) as (keyof T)[]) {
        const value = options[key];
        if (value !== undefined) {
            result[key] = value as Required<T>[keyof T];
        }
    }
    return result;
}
