/**
 * Plugin identity — declared once. The access key derives from `PACKAGE` via a
 * core helper, so there are no hand-written namespace strings scattered
 * elsewhere. Table naming is not here: `definePlugin` bakes the
 * `plugin_<alias>_` prefix into the schema module.
 */

import { derivePluginName } from 'astromech/plugin-kit';

export const PACKAGE = '@astromech/redirects';
export const VERSION = '0.1.0';
export const LABEL = 'Redirects';
export const ICON = 'Signpost';

/** `redirects` */
export const ALIAS = derivePluginName(PACKAGE);
