/**
 * The backups plugin registered on a fresh harness database, with the site's
 * storage on the filesystem driver.
 */
import type { PluginTestApp } from '@tests/plugin-app';
import { createTestStorage, makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { backups } from '../../src/index';

declare global {
    var __astromechBackupRunning: boolean | undefined;
}

/** A fresh app with the backups plugin installed and the overlap guard cleared. */
export async function createBackupsApp(): Promise<PluginTestApp<'backups'>> {
    const app = await createPluginTestApp('backups', {
        ...makeTestConfig(),
        storage: createTestStorage(),
        plugins: [backups()],
    });
    globalThis.__astromechBackupRunning = false;
    return app;
}

/** Take a backup through the trusted service and return its run, failing the test if none was taken. */
export async function takeBackup(app: PluginTestApp<'backups'>) {
    const result = await app.service.run();
    if (!result.ok) throw new Error(`the backup did not run: ${result.reason}`);
    return result.run;
}

/** The run's artifact key, or a thrown error when the run stored none. */
export function artifactKey(run: { key: string | null }): string {
    if (run.key === null) throw new Error('the run stored no artifact');
    return run.key;
}
