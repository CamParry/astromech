/**
 * CLI Config Loader
 *
 * Loads astromech.config.ts using jiti (so TypeScript files are supported
 * without a pre-build step) and initialises the DB registry so service methods work.
 */

import { setDb } from '@/database/registry';
import { resolveConfig } from '@/config/resolve';
import { loadConfigFile } from '@/config/load';
import { setConfig } from '@/config/registry';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';

export async function loadRawConfig(configPath?: string): Promise<AstromechConfig> {
    return loadConfigFile(process.cwd(), configPath);
}

/**
 * Load, guard and resolve the config, and initialise the DB registry.
 *
 * `allowRemote` is `--allow-remote`: a remote database is refused by default so a
 * command meant for a dev machine cannot hit production by inheriting whatever
 * `DATABASE_URL` happens to be exported.
 */
export async function loadConfig(
    configPath?: string,
    options?: { allowRemote?: boolean }
): Promise<ResolvedConfig> {
    const rawConfig = await loadRawConfig(configPath);
    assertLocalDatabase(rawConfig, options?.allowRemote === true);

    // Initialise DB before resolving — resolveConfig strips db from the result
    const db = rawConfig.db.getInstance();
    setDb(db);

    const resolved = resolveConfig(rawConfig);
    setConfig(resolved);

    return resolved;
}

/**
 * Refuse a remote database unless the caller passed `--allow-remote`. Feature-detected
 * like `dump`/`restore`: a driver with no `isRemote` reads as local.
 */
export function assertLocalDatabase(config: AstromechConfig, allowRemote: boolean): void {
    if (allowRemote) return;
    if (config.db.isRemote?.() !== true) return;

    console.error(
        `[astromech] refusing to open the "${config.db.type}" database: it is remote, ` +
            'and a CLI command run against a remote database writes to whatever it ' +
            'is pointed at. Re-run with --allow-remote if that is what you intend.'
    );
    process.exit(1);
}
