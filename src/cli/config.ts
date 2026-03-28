/**
 * CLI Config Loader
 *
 * Loads astromech.config.ts using jiti (so TypeScript files are supported
 * without a pre-build step) and initialises the DB registry so SDK methods work.
 */

import { createJiti } from 'jiti';
import { resolve } from 'node:path';
import { setDb } from '@/db/registry.js';
import { resolveConfig } from '@/core/config-resolver.js';
import { setCliConfig } from './virtual-config-shim.js';
import type { AstromechConfig, ResolvedConfig } from '@/types/index.js';

export async function loadConfig(configPath?: string): Promise<ResolvedConfig> {
    const jiti = createJiti(import.meta.url);
    const path = configPath ? resolve(process.cwd(), configPath) : resolve(process.cwd(), 'astromech.config.ts');

    const mod = await jiti.import(path) as { default: AstromechConfig };
    const rawConfig = mod.default;

    // Initialise DB before resolving — resolveConfig strips db from the result
    const db = rawConfig.db.getInstance();
    setDb(db);

    const resolved = resolveConfig(rawConfig);

    // Populate the virtual:astromech/config shim so SDK modules work
    setCliConfig(resolved);

    return resolved;
}
