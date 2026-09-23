/**
 * How a CLI command reaches the site: `bootApplication` boots it through
 * `createAstromech`, and `loadConfig` only loads and resolves the config, for
 * the commands that must run before the application can (`db:*`, codegen).
 */

import type { Astromech } from '@/astromech';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import { createAstromech } from '@/astromech';
import { loadConfigFile } from '@/config/load';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import { setDb } from '@/database/registry';
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
 * Load the config file once, guard it, resolve it, and register the config and
 * the database, without booting. For the commands the application cannot boot
 * without (`db:*`) and those that only read the config.
 *
 * `allowRemote` is `--allow-remote`: a remote database is refused by default so a
 * command meant for a dev machine cannot hit production by inheriting whatever
 * `DATABASE_URL` happens to be exported.
 */
export async function loadConfig(
    configPath?: string,
    options?: LoadOptions
): Promise<{ config: AstromechConfig; resolved: ResolvedConfig }> {
    const config = await loadConfigFile(process.cwd(), configPath);
    assertLocalDatabase(config, options?.allowRemote === true);

    // Before resolving: `resolveConfig` strips `db` from the result.
    setDb(config.db.getInstance());

    const resolved = resolveConfig(config);
    setConfig(resolved);
    return { config, resolved };
}

/**
 * Refuse a remote database unless the caller passed `--allow-remote`. Feature-detected
 * like `dump`/`restore`: a driver with no `isRemote` reads as local.
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
