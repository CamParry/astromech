/**
 * Ratings overview — a component view at `/admin/plugin/rating/overview`,
 * gated on the plugin's `view` permission. The renderer lives in
 * `admin/pages/overview-page.tsx`; this is its admin-page registration.
 */

import { defineAdminPage } from 'astromech';

export const overviewPage = defineAdminPage({
    path: '/overview',
    label: 'Overview',
    icon: 'ChartBar',
    component: './admin/pages/overview-page.tsx',
    permission: 'view',
});
