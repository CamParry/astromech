/**
 * SEO overview dashboard — a component view at `/admin/plugin/seo/overview`,
 * gated on the plugin's `view` permission. The renderer lives in
 * `admin/pages/overview-page.tsx`; this is its admin-page registration.
 */

import { defineAdminPage } from 'astromech';
import { asset } from '../manifest.js';

export const overviewPage = defineAdminPage({
    path: '/overview',
    label: 'Overview',
    icon: 'Gauge',
    component: asset('admin/pages/overview-page.tsx'),
    permission: 'view',
});
