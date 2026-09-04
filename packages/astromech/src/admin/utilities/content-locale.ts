/**
 * The content locale the admin falls back to when a route carries none. The
 * admin's display locale (`en-GB`) is not necessarily a content locale, so it
 * resolves down its lookup chain first.
 */

import adminConfig from 'virtual:astromech/admin-config';
import { resolveContentLocale } from '@/utilities/locale';

export function defaultContentLocale(): string {
    return (
        resolveContentLocale(adminConfig.defaultLocale, adminConfig.locales) ??
        adminConfig.locales[0] ??
        adminConfig.defaultLocale
    );
}

/**
 * Locale options for a translatable resource's locale switcher: the content
 * default first, the rest alphabetical, and a locale with no content row
 * labelled "Add XX".
 */
export function localeOptions(itemLocales: string[]): { value: string; label: string }[] {
    // The content default, not `adminConfig.defaultLocale`: that is the
    // admin's display tag (`en-GB`), which need not be a content locale.
    const defaultLocale = defaultContentLocale();
    const { locales } = adminConfig;
    const sorted = [defaultLocale, ...locales.filter((l) => l !== defaultLocale).sort()];
    return sorted.map((loc) => ({
        value: loc,
        label: itemLocales.includes(loc) ? loc.toUpperCase() : `Add ${loc.toUpperCase()}`,
    }));
}
