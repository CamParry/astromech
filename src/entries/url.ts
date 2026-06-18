/**
 * Resolve an entry type's `url` template against an entry — the single source
 * of truth for "where does this entry live on the front end". Tokens: `{slug}`
 * → the entry's slug; `{anyField}` → that field's value. Used by the admin
 * "View" link and the redirects plugin.
 */

export type UrlEntry = {
    slug: string | null;
    fields: Record<string, unknown>;
};

export function resolveEntryUrl(template: string, entry: UrlEntry): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        if (key === 'slug') return entry.slug ?? '';
        return String(entry.fields[key] ?? '');
    });
}

/**
 * The path portion of a resolved entry URL. Tolerates absolute (`https://…`)
 * and relative (`/blog/{slug}`) templates alike. Returns null if the resolved
 * value can't be parsed as a URL.
 */
export function resolveEntryPath(template: string, entry: UrlEntry): string | null {
    const resolved = resolveEntryUrl(template, entry);
    try {
        return new URL(resolved, 'http://localhost').pathname;
    } catch {
        return null;
    }
}
