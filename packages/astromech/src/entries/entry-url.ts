/**
 * Resolve an entry type's `url` template against an entry, the single source
 * of truth for "where does this entry live on the front end". Tokens: `{slug}`
 * is the entry's slug; `{anyField}` is that field's value. Used by the admin
 * "View" link and the menus, redirects and seo plugins.
 */

export type UrlEntry = {
    slug: string | null;
    fields: Record<string, unknown>;
};

/**
 * The template with every token replaced, or null when any token resolves to
 * an empty string: a null or `''` slug, or a field that is missing, null or
 * `''`. An entry with an empty token has no URL, since filling the gap with
 * `''` gives a different URL (`/{category}/{slug}` would become `//hello`).
 */
export function resolveEntryUrl(template: string, entry: UrlEntry): string | null {
    let empty = false;
    const resolved = template.replace(/\{(\w+)\}/g, (_, key: string) => {
        const value = key === 'slug' ? entry.slug : entry.fields[key];
        const text = value == null ? '' : String(value);
        if (text === '') empty = true;
        return text;
    });
    return empty ? null : resolved;
}

/**
 * The path portion of a resolved entry URL. Tolerates absolute (`https://…`)
 * and relative (`/blog/{slug}`) templates alike. Returns null when the entry
 * has no URL (see `resolveEntryUrl`) or the resolved value can't be parsed as
 * a URL.
 */
export function resolveEntryPath(template: string, entry: UrlEntry): string | null {
    const resolved = resolveEntryUrl(template, entry);
    if (resolved === null) return null;
    try {
        return new URL(resolved, 'http://localhost').pathname;
    } catch {
        return null;
    }
}
