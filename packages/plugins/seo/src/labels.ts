/**
 * Config-time label key scoped to this plugin's i18n namespace.
 *
 * `seoSection()` (in `fields/groups.ts`) is host-facing: a site calls it
 * directly from its own entry-type config, before any plugin runtime exists,
 * so there is no `PluginContext` to read `ctx.plugin.namespace` from. This
 * file is therefore the one place in the package that derives its own
 * identity outside `index.ts` — everything else reads it off `ctx.plugin`
 * instead.
 *
 * Plugin labels are composed into arbitrary entry types (including core
 * ones), so a bare `t('seo.x')` would resolve against the host entry's
 * namespace and miss. Prefixing with the namespace (`seo:seo.x`) pins
 * resolution to this plugin's bundle regardless of where the section is
 * mounted.
 */

import { pluginNamespace, t as labelKey } from 'astromech/plugin-kit';
import type { MessageDescriptor } from 'astromech';
import { SEO_PACKAGE } from './types.js';

const NAMESPACE = pluginNamespace(SEO_PACKAGE);

export function tKey(key: string): MessageDescriptor {
    return labelKey(`${NAMESPACE}:${key}`);
}
