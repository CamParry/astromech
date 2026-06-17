/**
 * Plugin identity — declared once. The permission namespace derives from
 * `PACKAGE` via core helpers, keeping namespace strings consistent.
 */

import { derivePluginName, sanitisePackage } from '@/plugins/runtime/plugin-identity.js';

export const PACKAGE = '@astromech/menus';
export const VERSION = '0.1.0';
export const LABEL = 'Menus';
export const ICON = 'Menu';

/** `menus` */
export const ALIAS = derivePluginName(PACKAGE);
/** `astromech-menus` */
export const PERMISSION_NAMESPACE = sanitisePackage(PACKAGE);

/**
 * Blob key for a menu's settings page: `plugin:<ns>:/menus/<key>`.
 * The settings page has `path: '/menus/<key>'`, so the blob lives at
 * `plugin:astromech-menus:/menus/<key>` (+ `:<locale>` for per-locale).
 */
export function menuBlobKey(menuKey: string): string {
    return `plugin:${PERMISSION_NAMESPACE}:/menus/${menuKey}`;
}
