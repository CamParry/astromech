/**
 * @astromech/backups — scheduled and on-demand database backups stored in
 * plugin storage (R2 / filesystem). HTTP routes and the admin UI are separate
 * slices; this module wires up the cron job and the permission declarations.
 */

import { definePlugin, withDefaults } from 'astromech';
import type { PluginContext, ServiceInterface } from 'astromech';
import { BACKUPS_PACKAGE } from './types.js';
import type { BackupsOptions } from './types.js';
import { migrationProvider } from '../migrations/index.js';
import { backupRunsTable } from './tables/runs.js';
import { backupsPermissions } from './permissions/backups.js';
import { performBackup, resolveKeep } from './backup.js';
import { buildBackupsService } from './service/backups.js';
import { buildBackupRoutes } from './routes/backups.js';
import { backupsPage } from './pages/backups.js';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        backups: ServiceInterface<ReturnType<typeof buildBackupsService>>;
    }
}

export type { BackupsOptions } from './types.js';
export type {
    BackupCapabilities,
    DeleteRunResult,
    ListRunsResult,
    TriggerRunResult,
} from './service/backups.js';

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
        tables: [backupRunsTable],
        migrations: migrationProvider,
        permissions: backupsPermissions,
        i18n: ['en'],
        admin: {
            pages: [backupsPage],
        },
        service: buildBackupsService(keep),
        // Streaming only — the JSON endpoints live on the service above.
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
