/**
 * Plugin identity — declared once. Everything namespace-related (permission
 * keys, table prefix, schema-module specifier) derives from `PACKAGE` via core
 * helpers, so there are no hand-written namespace strings scattered elsewhere.
 */

import {
    derivePluginName,
    pluginSchemaModule,
    pluginTablePrefix,
} from '@/core/plugin-identity.js';

export const PACKAGE = '@astromech/redirects';
export const VERSION = '0.1.0';
export const LABEL = 'Redirects';
export const ICON = 'Signpost';

/** `redirects` */
export const ALIAS = derivePluginName(PACKAGE);
/** `astromech/plugins/redirects/schema` */
export const SCHEMA_MODULE = pluginSchemaModule(ALIAS);
/** `plugin_redirects_` */
export const TABLE_PREFIX = pluginTablePrefix(ALIAS);
