/**
 * Plugin identity — declared once, as one object, plus the specifier and
 * label-key helpers derived from it.
 *
 * This file stays a leaf: six modules across `permissions/`, `sdk/`, `pages/`
 * and `fields/` import it, and folding it into `index.ts` would make the
 * package cyclic.
 */

import { pluginNamespace, t as labelKey } from 'astromech/plugin-kit';
import type { MessageDescriptor, PluginIdentity } from 'astromech';

export const plugin = {
    package: '@astromech/seo',
    version: '0.1.0',
    label: 'SEO',
    icon: 'Search',
} as const satisfies PluginIdentity;

/** `seo` — permission, i18n and route namespace. */
export const NAMESPACE = pluginNamespace(plugin.package);

/**
 * Module specifier for a bundled admin asset, e.g.
 * `asset('admin/pages/overview-page.tsx')`. A graduated package serves its
 * admin assets from its own published subpaths, so the root is the package name
 * itself rather than the in-tree `@/plugins/seo` root.
 */
export function asset(path: string): string {
    return `${plugin.package}/${path}`;
}

/**
 * Config-time label key scoped to this plugin's i18n namespace.
 *
 * Plugin labels are composed into arbitrary entry types (including core ones),
 * so a bare `t('seo.x')` would resolve against the host entry's namespace and
 * miss. Prefixing with the namespace (`seo:seo.x`) pins resolution to this
 * plugin's bundle regardless of where the section is mounted.
 */
export function tKey(key: string): MessageDescriptor {
    return labelKey(`${NAMESPACE}:${key}`);
}

/** i18n specifier map for the given locale codes, e.g. `locales(['en', 'fr'])`. */
export function locales(codes: string[]): Record<string, string> {
    return Object.fromEntries(codes.map((code) => [code, asset(`locales/${code}.json`)]));
}
