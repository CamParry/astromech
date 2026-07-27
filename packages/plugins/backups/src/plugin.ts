/**
 * Plugin identity — declared once, as one object, plus the specifier helpers
 * derived from it.
 *
 * `package` is the only identifier there is: the namespace behind the table
 * prefix, the permission strings, the i18n bundle and the HTTP route segment
 * all derive from it.
 *
 * This file stays a leaf. Four modules import it; folding it into `index.ts`
 * would make the package cyclic.
 */

import { pluginNamespace } from 'astromech/plugin-kit';
import type { PluginIdentity } from 'astromech';

export const plugin = {
    package: '@astromech/backups',
    version: '0.1.0',
    label: 'Backups',
    icon: 'DatabaseBackup',
} as const satisfies PluginIdentity;

/** `backups` — permission, i18n and route namespace. */
export const NAMESPACE = pluginNamespace(plugin.package);

/** Module specifier for a bundled admin asset, e.g. `asset('admin/pages/backups-page.tsx')`. */
export function asset(path: string): string {
    return `${plugin.package}/${path}`;
}

/** i18n specifier map for the given locale codes, e.g. `locales(['en'])`. */
export function locales(codes: string[]): Record<string, string> {
    return Object.fromEntries(codes.map((code) => [code, asset(`locales/${code}.json`)]));
}
