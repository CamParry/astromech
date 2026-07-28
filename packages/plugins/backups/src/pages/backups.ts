/**
 * Backups admin page — viewer and action surface at the plugin root `/`.
 * The renderer lives in `admin/pages/backups-page.tsx`; this is its registration.
 */

import { defineAdminPage } from 'astromech';

export const backupsPage = defineAdminPage({
    path: '',
    label: 'Backups',
    icon: 'DatabaseBackup',
    component: './admin/pages/backups-page.tsx',
    permission: 'read',
});
