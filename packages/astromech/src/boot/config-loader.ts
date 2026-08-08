/**
 * Config File Loader
 *
 * Loads the author's astromech.config.ts as a module in Node, using jiti
 * so TypeScript files work without a pre-build step. Shared by the CLI
 * and the Astro integration.
 */

import { createJiti } from 'jiti';
import { resolve } from 'node:path';
import type { AstromechConfig } from '@/types/index.js';

export const DEFAULT_CONFIG_FILE = './astromech.config.ts';

export async function loadConfigFile(
    rootDir: string,
    configFile?: string
): Promise<AstromechConfig> {
    const jiti = createJiti(import.meta.url);
    const mod = (await jiti.import(resolveConfigPath(rootDir, configFile))) as {
        default: AstromechConfig;
    };
    return mod.default;
}

/**
 * The absolute path of the author's config file. The Astro integration needs
 * the path itself, not the module, to re-export it from the virtual config.
 */
export function resolveConfigPath(rootDir: string, configFile?: string): string {
    return resolve(rootDir, configFile ?? DEFAULT_CONFIG_FILE);
}
