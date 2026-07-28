/**
 * @astromech/backups — scheduled and on-demand database backups stored in
 * plugin storage (R2 / filesystem). HTTP routes and the admin UI are separate
 * slices; this module wires up the cron job and the permission bundle.
 */

import { definePlugin, withDefaults } from 'astromech';
import type { PluginContext } from 'astromech';
import { BACKUPS_PACKAGE } from './types.js';
import type { BackupsOptions } from './types.js';
import { migrationProvider } from '../migrations/index.js';
import { backupRunsTable } from './schema/runs.js';
import {
    backupsPermissionBundles,
    backupsPermissionDefs,
} from './permissions/backups.js';
import { performBackup, resolveKeep } from './backup.js';
import { buildBackupRoutes } from './routes/backups.js';
import { backupsPage } from './pages/backups.js';

export type { BackupsOptions } from './types.js';

const DEFAULT_OPTIONS: Required<BackupsOptions> = {
    schedule: '0 3 * * *',
    keep: 7,
};

export const backups = definePlugin((options?: BackupsOptions) => {
    const { schedule, keep } = withDefaults(DEFAULT_OPTIONS, options);

    return {
        package: BACKUPS_PACKAGE,
        version: '0.1.0',
        label: 'Backups',
        icon: 'DatabaseBackup',
        schema: [backupRunsTable],
        migrations: migrationProvider,
        permissions: backupsPermissionDefs,
        permissionBundles: backupsPermissionBundles,
        i18n: ['en'],
        admin: {
            pages: [backupsPage],
        },
        rawRoutes: buildBackupRoutes(keep),
        cron: [
            {
                name: 'backup',
                schedule,
                handler: async (ctx: PluginContext) => {
                    const resolvedKeep = await resolveKeep(ctx, keep);
                    await performBackup(ctx, 'scheduled', { keep: resolvedKeep });
                },
            },
        ],
    };
});

export default backups;
