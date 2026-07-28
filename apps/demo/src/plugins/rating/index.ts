/**
 * demo-rating — a teaching plugin that exercises the external-plugin surface:
 * a custom `rating` field type, a component admin page, an auto-rendered
 * settings form, an SDK method, localized strings, and a permission bundle.
 *
 * It is structured exactly like a first-party plugin (types / permissions /
 * fields / pages / a thin `index`), but authored as an *external* plugin: it
 * imports from the published `astromech` package and lives outside any
 * published package, so `root: import.meta.url` resolves its relative asset
 * specifiers (component/i18n) against this file rather than a package
 * specifier. See `apps/docs/plugins/authoring.md` for the full convention.
 */

import { definePlugin } from 'astromech';
import { ratingPermissionBundles, ratingPermissionDefs } from './permissions/rating.js';
import { ratingField } from './fields/rating.js';
import { overviewPage } from './pages/overview.js';
import { settingsPage } from './pages/settings.js';
import { ratingSdk } from './sdk/describe.js';

export { RATING_FIELD_TYPE } from './types.js';

export const rating = definePlugin({
    package: 'demo-rating',
    version: '1.0.0',
    label: 'Ratings',
    icon: 'Star',
    root: import.meta.url,
    permissionBundles: ratingPermissionBundles,
    permissions: ratingPermissionDefs,
    i18n: ['en'],
    fields: [ratingField],
    sdk: ratingSdk,
    admin: {
        pages: [overviewPage, settingsPage],
    },
});

export default rating;
