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
