/**
 * Permission bundles for composing into config roles. Bundle keys resolve to
 * `plugin:astromech-backups:{key}`.
 *
 *   roles: { admin: { permissions: [...backupsPermissions('manage')] } }
 */

import { definePermissionBundles } from 'astromech';
import type { PluginPermission } from 'astromech';
import { PACKAGE } from '../manifest.js';

export const backupsPermissions = definePermissionBundles(PACKAGE, {
    manage: ['read', 'run', 'restore', 'delete'],
    view: ['read'],
});

export const backupsPermissionDefs: PluginPermission[] = [
    {
        key: 'read',
        label: 'View backups',
        description: 'List backup runs and artifact metadata.',
    },
    { key: 'run', label: 'Trigger backup', description: 'Manually trigger a backup.' },
    {
        key: 'restore',
        label: 'Restore from backup',
        description: 'Restore the database from a backup artifact.',
    },
    {
        key: 'delete',
        label: 'Delete backup',
        description: 'Delete backup artifacts from storage.',
    },
];
