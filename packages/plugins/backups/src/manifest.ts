/**
 * Plugin identity — declared once. The access key and permission namespace
 * derive from `PACKAGE` via core helpers, so there are no hand-written
 * namespace strings scattered elsewhere. Table naming is not here:
 * `definePlugin` bakes the `plugin_<alias>_` prefix into the schema module.
 */

import { derivePluginName, sanitisePackage } from 'astromech/plugin-kit';

export const PACKAGE = '@astromech/backups';
export const VERSION = '0.1.0';
export const LABEL = 'Backups';
export const ICON = 'DatabaseBackup';

/** `backups` */
export const ALIAS = derivePluginName(PACKAGE);
/** `astromech-backups` */
export const PERMISSION_NAMESPACE = sanitisePackage(PACKAGE);

/** Module specifier for a bundled admin asset, e.g. `asset('admin/pages/backups-page.tsx')`. */
export function asset(path: string): string {
    return `${PACKAGE}/${path}`;
}

/** i18n specifier map for the given locale codes, e.g. `locales(['en'])`. */
export function locales(codes: string[]): Record<string, string> {
    return Object.fromEntries(codes.map((code) => [code, asset(`locales/${code}.json`)]));
}
