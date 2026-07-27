/**
 * Plugin identity — declared once, as one object, plus the settings-key helper
 * derived from it.
 *
 * This file stays a leaf: `index.ts` and `sdk/menus.ts` both import it, and
 * folding it into `index.ts` would make the package cyclic.
 */

import { pluginNamespace } from 'astromech/plugin-kit';
import type { PluginIdentity } from 'astromech';

export const plugin = {
    package: '@astromech/menus',
    version: '0.1.0',
    label: 'Menus',
    icon: 'Menu',
} as const satisfies PluginIdentity;

/** `menus` — permission, i18n and route namespace. */
export const NAMESPACE = pluginNamespace(plugin.package);

/**
 * Blob key for a menu's settings page: `plugin:<ns>:/menus/<key>`.
 * The settings page has `path: '/menus/<key>'`, so the blob lives at
 * `plugin:menus:/menus/<key>` (+ `:<locale>` for per-locale).
 */
export function menuBlobKey(menuKey: string): string {
    return `plugin:${NAMESPACE}:/menus/${menuKey}`;
}
