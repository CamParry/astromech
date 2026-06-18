/**
 * Plugin identity — declared once. Everything namespace-related (permission
 * keys, table prefix, schema-module specifier) derives from `PACKAGE` via core
 * helpers, so there are no hand-written namespace strings scattered elsewhere.
 */

import { derivePluginName, pluginTablePrefix } from 'astromech/plugin-kit';

export const PACKAGE = '@astromech/redirects';
export const VERSION = '0.1.0';
export const LABEL = 'Redirects';
export const ICON = 'Signpost';

/** `redirects` */
export const ALIAS = derivePluginName(PACKAGE);
/**
 * `@astromech/redirects/schema` — the package's own schema subpath. A
 * graduated package owns its migrations via `{package}/schema`, so the
 * generated drizzle aggregator points straight at the published export.
 */
export const SCHEMA_MODULE = `${PACKAGE}/schema`;
/** `plugin_redirects_` */
export const TABLE_PREFIX = pluginTablePrefix(ALIAS);
