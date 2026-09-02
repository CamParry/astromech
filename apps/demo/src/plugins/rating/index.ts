/**
 * demo-rating — a teaching plugin that exercises the external-plugin surface:
 * a custom `rating` field type, a component admin page, a settings global, a
 * service method, localized strings, and a declared permission.
 */

import { definePlugin } from 'astromech';
import { ratingField } from './fields/rating';
import { settingsGlobal } from './globals/settings';
import { overviewPage } from './pages/overview';
import { ratingPermissions } from './permissions/rating';
import { ratingService } from './service/describe';

export { RATING_FIELD_TYPE } from './fields/rating';

export const rating = definePlugin({
    package: 'demo-rating',
    version: '1.0.0',
    label: 'Ratings',
    icon: 'Star',
    root: import.meta.url,
    permissions: ratingPermissions,
    i18n: ['en'],
    fields: [ratingField],
    service: ratingService,
    globals: [settingsGlobal],
    admin: {
        pages: [overviewPage],
    },
});

export default rating;
