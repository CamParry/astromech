/**
 * Ratings overview — a component view at `/admin/plugin/rating/overview`,
 * gated on the plugin's `view` permission. The renderer lives in
 * `pages/overview-page.tsx`; this is its admin-page registration.
 */

import { defineAdminPage } from 'astromech';
import { asset } from '../manifest.js';

export const overviewPage = defineAdminPage({
    path: '/overview',
    label: 'Overview',
    icon: 'ChartBar',
    component: asset('pages/overview-page.tsx'),
    permission: 'view',
});
