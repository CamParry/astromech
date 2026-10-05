/**
 * The admin's locale switcher options. The default content locale comes from
 * core's `defaultContentLocale`, since the admin's display locale (`en-GB`)
 * need not be a content locale.
 */

import { defaultContentLocale } from 'astromech/shared';
import adminConfig from 'virtual:astromech/admin-config';

/**
 * Locale options for a translatable resource's locale switcher: the content
 * default first, the rest alphabetical, and a locale with no content row
 * labelled "Add XX".
 */
export function localeOptions(itemLocales: string[]): { value: string; label: string }[] {
    // The content default, not `adminConfig.defaultLocale`: that is the
    // admin's display tag (`en-GB`), which need not be a content locale.
    const defaultLocale = defaultContentLocale(adminConfig);
    const { locales } = adminConfig;
    const sorted = [defaultLocale, ...locales.filter((l) => l !== defaultLocale).sort()];
    return sorted.map((loc) => ({
        value: loc,
        label: itemLocales.includes(loc) ? loc.toUpperCase() : `Add ${loc.toUpperCase()}`,
    }));
}
