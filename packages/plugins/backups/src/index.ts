/**
 * @astromech/backups — scheduled and on-demand database backups stored in
 * plugin storage (R2 / filesystem). HTTP routes and the admin UI are separate
 * slices; this module wires up the cron job and the permission declarations.
 */

import type { BackupsOptions } from './types';
import type { PluginContext, PluginDB, ServiceInterface } from 'astromech';
import { definePlugin, withDefaults } from 'astromech';
import { migrationProvider } from '../migrations/index';
import { performBackup, resolveKeep } from './backup';
import { settingsGlobal } from './globals/settings';
import { backupsPage } from './pages/backups';
import { backupsPermissions } from './permissions/backups';
import { buildBackupRoutes } from './routes/backups';
import { createBackupsService } from './service/backups';
import { backupRunsTable } from './tables/runs';
import { BACKUPS_PACKAGE } from './types';

/** Listed once: the definition and the `AstromechPluginTables` augmentation both read it. */
const tables = [backupRunsTable] as const;

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        backups: ServiceInterface<ReturnType<typeof createBackupsService>>;
    }

    // Puts this plugin's tables on a site's `db` handle.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
    interface AstromechPluginTables extends PluginDB<typeof tables> {}
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
        tables,
        migrations: migrationProvider,
        permissions: backupsPermissions,
        i18n: ['en'],
        globals: [settingsGlobal],
        admin: {
            pages: [backupsPage],
            optimizeDeps: { include: ['@tanstack/react-query'] },
        },
        service: createBackupsService(keep),
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
