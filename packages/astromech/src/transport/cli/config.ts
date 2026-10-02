/**
 * How a CLI command reaches the site: `bootApplication` boots it through
 * `createAstromech`; `loadConfig` and `loadConfigWithoutDrivers` only load and
 * resolve the config, for the commands that run before it can (`db:*`, codegen).
 */

import type { Astromech } from '@/astromech';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import { createAstromech } from '@/astromech';
import { loadConfigFile } from '@/config/load';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import { registerDrivers } from '@/register-drivers';
import { log } from '@/utilities/log';
import { toAllowRemoteOption } from './common-args';
import { describeCallError, printError } from './output';

/** The remote-database guard every command that opens the database takes. */
type LoadOptions = { allowRemote?: boolean };

/**
 * Load the config file once, guard it, and boot the application, so plugin
 * hooks, plugin repositories, storage and email are all wired as they are when
 * serving.
 */
export async function bootApplication(
    configPath?: string,
    options?: LoadOptions
): Promise<Astromech> {
    const config = await loadConfigFile(process.cwd(), configPath);
    assertLocalDatabase(config, options?.allowRemote === true);
    return createAstromech({ config });
}

/**
 * Boot the application from the command's `--config` and `--allow-remote`, then
 * run `body`. Any error is reported the one way every command reports one:
 * `{ error }` on stderr under `--json`, `Error: …` otherwise, with exit code 1.
 */
export async function withApplication(
    args: { config?: string | undefined; 'allow-remote'?: boolean; json?: boolean },
    body: (app: Astromech) => Promise<void>
): Promise<void> {
    try {
        await body(await bootApplication(args.config, toAllowRemoteOption(args)));
    } catch (error) {
        printError(describeCallError(error), { json: args.json === true });
    }
}

/**
 * `loadConfigWithoutDrivers`, guard the database, then register the config's
 * drivers the way boot does, without booting. For the commands that open the
 * database before the application can boot (`db:init`, `db:status`, `plugin:purge`).
 */
export async function loadConfig(
    configPath?: string,
    options?: LoadOptions
): Promise<{ config: AstromechConfig; resolved: ResolvedConfig }> {
    const loaded = await loadConfigWithoutDrivers(configPath);
    assertLocalDatabase(loaded.config, options?.allowRemote === true);
    // The raw config: `resolveConfig` strips the drivers from its result.
    registerDrivers(loaded.config);
    return loaded;
}

/**
 * Load the config file once, then resolve and register the config, opening no
 * driver. For the commands that only read the config: codegen, `permissions`,
 * `db:generate` and `db:rebaseline`.
 */
export async function loadConfigWithoutDrivers(
    configPath?: string
): Promise<{ config: AstromechConfig; resolved: ResolvedConfig }> {
    const config = await loadConfigFile(process.cwd(), configPath);
    const resolved = resolveConfig(config);
    setConfig(resolved);
    return { config, resolved };
}

/**
 * Refuse a remote database unless the caller passed `--allow-remote`, so a command
 * meant for a dev machine cannot write to production through an exported
 * `DATABASE_URL`. A driver with no `isRemote` reads as local.
 */
export function assertLocalDatabase(config: AstromechConfig, allowRemote: boolean): void {
    if (allowRemote) return;
    if (config.db.isRemote?.() !== true) return;

    log.error(
        `refusing to open the "${config.db.type}" database: it is remote, ` +
            'and a CLI command run against a remote database writes to whatever it ' +
            'is pointed at. Re-run with --allow-remote if that is what you intend.'
    );
    process.exit(1);
}
