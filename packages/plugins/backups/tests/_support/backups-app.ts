/**
 * The backups plugin registered on a fresh harness database, with the site's
 * storage on the filesystem driver, plus a way to call its raw routes as a
 * role. `PluginTestApp.request` sends no identity, and download and restore
 * refuse an anonymous caller, so those requests go through `requestAs`.
 */
import type { Role, User } from '@/types/index';
import type { PluginTestApp } from '@tests/plugin-app';
import { makeUser } from '@tests/fixtures';
import { createTestStorage, makeTestConfig, requestAs } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { createHttpApp } from '@/transport/http/app';
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

/**
 * Send `method` to `path` (relative to `{basePath}/api`) on the whole HTTP app
 * as a signed-in user holding `role`, or as nobody when `role` is null.
 */
export function requestAsRole(
    app: PluginTestApp<'backups'>,
    role: Role | null,
    method: string,
    path: string
): Promise<Response> {
    const user: User | null = role === null ? null : makeUser();
    return requestAs(
        createHttpApp(app.config),
        { user, role },
        `${app.config.basePath}/api${path}`,
        { method }
    );
}

/** The run's artifact key, or a thrown error when the run stored none. */
export function artifactKey(run: { key: string | null }): string {
    if (run.key === null) throw new Error('the run stored no artifact');
    return run.key;
}
