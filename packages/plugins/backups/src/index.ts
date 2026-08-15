/**
 * @astromech/backups — scheduled and on-demand database backups stored in
 * plugin storage (R2 / filesystem). HTTP routes and the admin UI are separate
 * slices; this module wires up the cron job and the permission declarations.
 */

import { definePlugin, withDefaults } from 'astromech';
import type { PluginContext, ServiceInterface } from 'astromech';
import { BACKUPS_PACKAGE } from './types';
import type { BackupsOptions } from './types';
import { migrationProvider } from '../migrations/index';
import { backupRunsTable } from './tables/runs';
import { backupsPermissions } from './permissions/backups';
import { performBackup, resolveKeep } from './backup';
import { buildBackupsService } from './service/backups';
import { buildBackupRoutes } from './routes/backups';
import { backupsPage } from './pages/backups';
import { settingsPage } from './pages/settings';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        backups: ServiceInterface<ReturnType<typeof buildBackupsService>>;
    }
}

export type { BackupsOptions } from './types';
export type {
    BackupCapabilities,
    DeleteRunResult,
    ListRunsResult,
    TriggerRunResult,
} from './service/backups';

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
            pages: [backupsPage, settingsPage],
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
