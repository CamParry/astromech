/**
 * Permission bundles for composing into config roles. Bundle keys resolve to
 * `plugin:backups:{key}`.
 *
 *   roles: { admin: { permissions: [...backups.permissions('manage')] } }
 */

import type { PluginPermission } from 'astromech';

export const backupsPermissionBundles = {
    manage: ['read', 'run', 'restore', 'delete'],
    view: ['read'],
} as const;

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
