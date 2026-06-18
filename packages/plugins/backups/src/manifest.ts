/**
 * Plugin identity — declared once. Everything namespace-related (permission
 * keys, table prefix, schema-module specifier) derives from `PACKAGE` via core
 * helpers, so there are no hand-written namespace strings scattered elsewhere.
 */

import {
    derivePluginName,
    pluginTablePrefix,
    sanitisePackage,
} from 'astromech/plugin-kit';

export const PACKAGE = '@astromech/backups';
export const VERSION = '0.1.0';
export const LABEL = 'Backups';
export const ICON = 'DatabaseBackup';

/** `backups` */
export const ALIAS = derivePluginName(PACKAGE);
/** `astromech-backups` */
export const PERMISSION_NAMESPACE = sanitisePackage(PACKAGE);
/**
 * `@astromech/backups/schema` — the package's own schema subpath. A
 * graduated package owns its migrations via `{package}/schema`, so the
 * generated drizzle aggregator points straight at the published export.
 */
export const SCHEMA_MODULE = `${PACKAGE}/schema`;
/** `plugin_backups_` */
export const TABLE_PREFIX = pluginTablePrefix(ALIAS);

/** Module specifier for a bundled admin asset, e.g. `asset('admin/pages/backups-page.tsx')`. */
export function asset(path: string): string {
    return `${PACKAGE}/${path}`;
}

/** i18n specifier map for the given locale codes, e.g. `locales(['en'])`. */
export function locales(codes: string[]): Record<string, string> {
    return Object.fromEntries(codes.map((code) => [code, asset(`locales/${code}.json`)]));
}
