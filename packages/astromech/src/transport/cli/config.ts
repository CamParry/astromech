/**
 * CLI Config Loader
 *
 * Loads astromech.config.ts using jiti (so TypeScript files are supported
 * without a pre-build step) and initialises the DB registry so service methods work.
 */

import { setDb } from '@/database/registry';
import { resolveConfig } from '@/boot/config-resolver';
import { loadConfigFile } from '@/boot/config-loader';
import { setCliConfig } from './virtual-config-shim';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';

export async function loadRawConfig(configPath?: string): Promise<AstromechConfig> {
    return loadConfigFile(process.cwd(), configPath);
}

export async function loadConfig(configPath?: string): Promise<ResolvedConfig> {
    const rawConfig = await loadRawConfig(configPath);

    // Initialise DB before resolving — resolveConfig strips db from the result
    const db = rawConfig.db.getInstance();
    setDb(db);

    const resolved = resolveConfig(rawConfig);

    // Populate the virtual:astromech/config shim so local-transport modules work
    setCliConfig(resolved);

    return resolved;
}
