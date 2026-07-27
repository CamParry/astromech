/**
 * demo-rating — a teaching plugin that exercises the external-plugin surface:
 * a custom `rating` field type, a component admin page, an auto-rendered
 * settings form, localized strings, and a permission bundle.
 *
 * It is structured exactly like a first-party plugin (plugin / types /
 * permissions / fields / pages / a thin `index`), but authored as an *external*
 * plugin: it imports from the published `astromech` package and resolves assets
 * via `fileURLToPath` (see `plugin.ts`) rather than published module
 * specifiers. See `apps/docs/plugins/authoring.md` for the full convention.
 */

import { definePlugin } from 'astromech';
import { plugin, locales } from './plugin.js';
import { ratingPermissionDefs } from './permissions/rating.js';
import { ratingField } from './fields/rating.js';
import { overviewPage } from './pages/overview.js';
import { settingsPage } from './pages/settings.js';

export { ratingPermissions } from './permissions/rating.js';
export { RATING_FIELD_TYPE } from './types.js';

export const rating = definePlugin(plugin, () => ({
    permissions: ratingPermissionDefs,
    i18n: locales(['en']),
    fields: [ratingField],
    admin: {
        pages: [overviewPage, settingsPage],
    },
}));

export default rating;
