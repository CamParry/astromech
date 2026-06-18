/**
 * @astromech/backups — scheduled and on-demand database backups stored in
 * plugin storage (R2 / filesystem). HTTP routes and the admin UI are separate
 * slices; this module wires up the cron job and the permission bundle.
 */

import { definePlugin, withDefaults } from 'astromech';
import type { PluginContext, PluginDefinition } from 'astromech';
import { PACKAGE, VERSION, LABEL, ICON, SCHEMA_MODULE, locales } from './manifest.js';
import type { BackupsOptions } from './types.js';
import { backupRunsTable } from './schema/runs.js';
import { backupsPermissionDefs } from './permissions/backups.js';
import { performBackup, resolveKeep } from './backup.js';
import { buildBackupRoutes } from './routes/backups.js';
import { backupsPage } from './pages/backups.js';

export type { BackupsOptions } from './types.js';
export { backupsPermissions } from './permissions/backups.js';

const DEFAULT_OPTIONS: Required<BackupsOptions> = {
    schedule: '0 3 * * *',
    keep: 7,
};

export const backups = definePlugin<BackupsOptions>((options) => {
    const { schedule, keep } = withDefaults(DEFAULT_OPTIONS, options);

    const definition: PluginDefinition = {
        package: PACKAGE,
        version: VERSION,
        label: LABEL,
        icon: ICON,
        schemaModule: SCHEMA_MODULE,
        schema: [backupRunsTable],
        permissions: backupsPermissionDefs,
        i18n: locales(['en']),
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

    return definition;
});

export default backups;
