/**
 * Plugin identity — declared once, as one object.
 *
 * `package` is the only identifier there is: the namespace behind the table
 * prefix, the permission strings, the i18n bundle and the HTTP route segment
 * all derive from it. Nothing here is hand-written twice, and there is no
 * alias to keep in sync.
 *
 * This file stays a leaf. Half the package imports it; folding it into
 * `index.ts` would make the package cyclic.
 */

import type { PluginIdentity } from 'astromech';

export const plugin = {
    package: '@astromech/redirects',
    version: '0.1.0',
    label: 'Redirects',
    icon: 'Signpost',
} as const satisfies PluginIdentity;
