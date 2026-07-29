/**
 * The permissions this plugin makes grantable. Bare keys; core namespaces them
 * to `plugin:backups:{key}`. A site enumerates the ones it grants:
 *
 *   roles: { admin: { permissions: [...backups.permissions('read', 'run')] } }
 */

import { definePermissions } from 'astromech';

export const backupsPermissions = definePermissions({
    read: {
        label: 'View backups',
        description: 'List backup runs and artifact metadata.',
    },
    run: { label: 'Trigger backup', description: 'Manually trigger a backup.' },
    download: {
        label: 'Download backup',
        description:
            'Download a backup artifact — a complete dump of every table, including user records and private settings.',
    },
    restore: {
        label: 'Restore from backup',
        description: 'Restore the database from a backup artifact.',
    },
    delete: {
        label: 'Delete backup',
        description: 'Delete backup artifacts from storage.',
    },
});
