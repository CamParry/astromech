/**
 * Site helpers: locale resolution, path localisation, UI strings.
 */

import Astromech from 'astromech/local';

export type Locale = string;

/**
 * Read at call time, never at module scope: config reaches the runtime through
 * the boot registry, and a page module is evaluated before the request that
 * boots it. Memoised because the config cannot change within a process.
 */
let cachedLocales: readonly Locale[] | undefined;
let cachedDefaultLocale: Locale | undefined;

/** Content locales, from `astromech.config.ts`. */
export function locales(): readonly Locale[] {
    return (cachedLocales ??= Astromech.config.locales ?? ['en']);
}

/**
 * `defaultLocale` is a display tag (`en-GB`) and need not be a content locale.
 * Routing matches locales exactly, so fall back to the first configured one.
 */
export function defaultLocale(): Locale {
    if (cachedDefaultLocale !== undefined) return cachedDefaultLocale;
    const all = locales();
    const configured = Astromech.config.defaultLocale;
    cachedDefaultLocale =
        configured !== undefined && all.includes(configured)
            ? configured
            : (all[0] ?? 'en');
    return cachedDefaultLocale;
}

/**
 * Resolve the active locale from a URL pathname.
 * The default locale is unprefixed; others live under `/<locale>/...`.
 */
export function localeFromPath(pathname: string): Locale {
    const seg = pathname.split('/')[1];
    if (seg && locales().includes(seg) && seg !== defaultLocale()) {
        return seg;
    }
    return defaultLocale();
}

/**
 * Strip a locale prefix from a path, returning the un-localised path.
 * e.g. `/fr/blog/foo` → `/blog/foo`, `/blog/foo` → `/blog/foo`
 */
export function stripLocalePrefix(pathname: string, locale: Locale): string {
    if (locale === defaultLocale()) return pathname;
    const prefix = `/${locale}`;
    if (pathname.startsWith(prefix + '/') || pathname === prefix) {
        return pathname.slice(prefix.length) || '/';
    }
    return pathname;
}

/**
 * Prepend a locale prefix to an un-localised path.
 * Default locale remains unprefixed.
 */
export function localizedPath(path: string, locale: Locale): string {
    if (locale === defaultLocale()) return path;
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `/${locale}${clean}`;
}

/**
 * Given the `locales` map from an entry (locale → entry id) and the current
 * locale, resolve the slug of the sibling entry for that locale.
 * Returns null if no sibling exists for the target locale.
 *
 * NOTE: the `locales` map returned by Astromech stores `{ [locale]: entryId }`.
 * To get the slug for a different locale, you need to fetch that entry.
 * This helper just returns the entry id so the caller can fetch it.
 */
export function siblingEntryId(
    localesMap: Record<string, string>,
    locale: Locale
): string | null {
    return localesMap[locale] ?? null;
}

// ── UI string dictionary ─────────────────────────────────────────────────────

type UiKey =
    | 'readMore'
    | 'published'
    | 'by'
    | 'tags'
    | 'category'
    | 'backToBlog'
    | 'backToCustomers'
    | 'relatedPosts'
    | 'metrics'
    | 'industry'
    | 'noPostsFound'
    | 'customers'
    | 'blog'
    | 'home';

const dict: Record<UiKey, Record<Locale, string>> = {
    readMore: { en: 'Read more', fr: 'Lire la suite' },
    published: { en: 'Published', fr: 'Publié le' },
    by: { en: 'By', fr: 'Par' },
    tags: { en: 'Tags', fr: 'Étiquettes' },
    category: { en: 'Category', fr: 'Catégorie' },
    backToBlog: { en: '← Back to blog', fr: '← Retour au blog' },
    backToCustomers: { en: '← Back to customers', fr: '← Retour aux clients' },
    relatedPosts: { en: 'Related posts', fr: 'Articles liés' },
    metrics: { en: 'Key metrics', fr: 'Métriques clés' },
    industry: { en: 'Industry', fr: 'Secteur' },
    noPostsFound: { en: 'No posts found.', fr: 'Aucun article trouvé.' },
    customers: { en: 'Customers', fr: 'Clients' },
    blog: { en: 'Blog', fr: 'Blog' },
    home: { en: 'Home', fr: 'Accueil' },
};

export function t(key: UiKey, locale: Locale): string {
    return dict[key][locale] ?? dict[key][defaultLocale()] ?? key;
}
