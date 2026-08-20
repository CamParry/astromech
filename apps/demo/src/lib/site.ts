/**
 * Site helpers: locale resolution, path localisation, UI strings.
 */

// The site's own config, not the application's: `localizedPath` and `t` are
// called from templates and have to answer synchronously, and `getAstromech()`
// is a promise. The locale list is authored here, so this is the source.
import config from '../../astromech.config.ts';

export type Locale = string;

/** Memoised: the config cannot change within a process. */
let cachedLocales: readonly Locale[] | undefined;
let cachedDefaultLocale: Locale | undefined;

/** Content locales, from `astromech.config.ts`. */
export function locales(): readonly Locale[] {
    return (cachedLocales ??= config.locales ?? ['en']);
}

/**
 * `defaultLocale` is a display tag (`en-GB`) and need not be a content locale.
 * Routing matches locales exactly, so fall back to the first configured one.
 */
export function defaultLocale(): Locale {
    if (cachedDefaultLocale !== undefined) return cachedDefaultLocale;
    const all = locales();
    const configured = config.defaultLocale;
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
 * The sibling entry id for `locale` from an entry's `locales` map, or `null`.
 * Returns an id, not a slug — the caller fetches that entry for the slug.
 */
export function siblingEntryId(
    localesMap: Record<string, string>,
    locale: Locale
): string | null {
    return localesMap[locale] ?? null;
}

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
