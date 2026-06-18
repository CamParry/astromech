/**
 * Site helpers: locale resolution, path localisation, UI strings.
 */

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Resolve the active locale from a URL pathname.
 * Default locale (`en`) is unprefixed; others live under `/<locale>/...`.
 */
export function localeFromPath(pathname: string): Locale {
    const seg = pathname.split('/')[1];
    if (seg && (LOCALES as readonly string[]).includes(seg) && seg !== DEFAULT_LOCALE) {
        return seg as Locale;
    }
    return DEFAULT_LOCALE;
}

/**
 * Strip a locale prefix from a path, returning the un-localised path.
 * e.g. `/fr/blog/foo` → `/blog/foo`, `/blog/foo` → `/blog/foo`
 */
export function stripLocalePrefix(pathname: string, locale: Locale): string {
    if (locale === DEFAULT_LOCALE) return pathname;
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
    if (locale === DEFAULT_LOCALE) return path;
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `/${locale}${clean}`;
}

/**
 * Given the `locales` map from an entry (locale → entry id) and the current
 * locale, resolve the slug of the sibling entry for that locale.
 * Returns null if no sibling exists for the target locale.
 *
 * NOTE: the `locales` map from the SDK stores `{ [locale]: entryId }`.
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
    return dict[key][locale] ?? dict[key][DEFAULT_LOCALE] ?? key;
}
