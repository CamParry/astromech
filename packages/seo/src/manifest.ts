/**
 * Plugin identity — declared once. The permission namespace and asset-specifier
 * root both derive from `PACKAGE` via core helpers rather than being
 * hand-written, so there are no scattered namespace or path strings.
 */

import { derivePluginName, sanitisePackage, t as labelKey } from 'astromech/plugin-kit';
import type { MessageDescriptor } from 'astromech';

export const PACKAGE = '@astromech/seo';
export const VERSION = '0.1.0';
export const LABEL = 'SEO';
export const ICON = 'Search';

/** `seo` */
export const ALIAS = derivePluginName(PACKAGE);
/** `astromech-seo` */
export const PERMISSION_NAMESPACE = sanitisePackage(PACKAGE);

/**
 * Asset-specifier root. A graduated package serves its admin assets from its
 * own published subpaths, so this is the package name itself (`@astromech/seo`)
 * rather than the in-tree `@/plugins/seo` root.
 */
const ASSET_ROOT = PACKAGE;

/** Module specifier for a bundled admin asset, e.g. `asset('admin/pages/overview-page.tsx')`. */
export function asset(path: string): string {
    return `${ASSET_ROOT}/${path}`;
}

/**
 * Config-time label key scoped to this plugin's i18n namespace.
 *
 * Plugin labels are composed into arbitrary entry types (including core ones),
 * so a bare `t('seo.x')` would resolve against the host entry's namespace and
 * miss. Prefixing with the namespace (`astromech-seo:seo.x`) pins resolution to
 * this plugin's bundle regardless of where the section is mounted.
 */
export function tKey(key: string): MessageDescriptor {
    return labelKey(`${PERMISSION_NAMESPACE}:${key}`);
}

/** i18n specifier map for the given locale codes, e.g. `locales(['en', 'fr'])`. */
export function locales(codes: string[]): Record<string, string> {
    return Object.fromEntries(codes.map((code) => [code, asset(`locales/${code}.json`)]));
}
