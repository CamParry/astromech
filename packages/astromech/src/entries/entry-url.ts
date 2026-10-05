/**
 * Resolve an entry type's `url` template against an entry. Tokens: `{slug}` is
 * the entry's slug; `{anyField}` is that field's value. The locale forms add
 * the locale prefix, for the admin "View" link and the redirects plugin.
 */

import type { ResolvedConfig } from '@/types/index';
import { defaultContentLocale } from '@/utilities/locale';

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

/**
 * The public path of one locale of an entry: `resolveEntryPath`, prefixed with
 * `/{locale}` unless the locale is the default content locale, as Astro's i18n
 * routing builds it with `prefixDefaultLocale: false`. Null as for `resolveEntryPath`.
 */
export function resolveEntryLocalePath(
    template: string,
    entry: UrlEntry & { locale: string },
    config: Pick<ResolvedConfig, 'locales' | 'defaultLocale'>
): string | null {
    const path = resolveEntryPath(template, entry);
    if (path === null || entry.locale === defaultContentLocale(config)) return path;
    return `/${entry.locale}${path}`;
}

/**
 * The URL of one locale of an entry: `resolveEntryUrl`, with `/{locale}` put
 * before the path as `resolveEntryLocalePath` does, keeping an absolute or
 * protocol-relative template's origin. Null as for `resolveEntryUrl`.
 */
export function resolveEntryLocaleUrl(
    template: string,
    entry: UrlEntry & { locale: string },
    config: Pick<ResolvedConfig, 'locales' | 'defaultLocale'>
): string | null {
    const url = resolveEntryUrl(template, entry);
    if (url === null || entry.locale === defaultContentLocale(config)) return url;
    // `scheme://host` or a protocol-relative `//host`.
    const origin = /^(?:[a-z][a-z\d+.-]*:)?\/\/[^/?#]*/i.exec(url)?.[0] ?? '';
    const rest = url.slice(origin.length);
    return `${origin}/${entry.locale}${rest.startsWith('/') ? rest : `/${rest}`}`;
}
