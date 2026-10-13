/**
 * Loads the author's astromech.config.ts as a module in Node, using jiti
 * so TypeScript files work without a pre-build step. Shared by the CLI
 * and the Astro integration.
 */

import type { AstromechConfig } from '@/types/index';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';

const DEFAULT_CONFIG_FILE = './astromech.config.ts';

/** Load the author's config file and return its default export. */
export async function loadConfigFile(
    rootDir: string,
    configFile?: string
): Promise<AstromechConfig> {
    // No module cache: the config imports the migration chain, and
    // `db:generate` rewrites its `index.ts`. A cached copy would hide the
    // migrations it added from a later load in the same process, such as
    // `astro dev` restarting after an `astro.config.mjs` edit.
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const configModule = await jiti.import<{ default: AstromechConfig }>(
        resolveConfigPath(rootDir, configFile)
    );
    return configModule.default;
}

/**
 * The absolute path of the author's config file. The Astro integration needs
 * the path itself, not the module, to re-export it from the virtual config.
 */
export function resolveConfigPath(rootDir: string, configFile?: string): string {
    return resolve(rootDir, configFile ?? DEFAULT_CONFIG_FILE);
}
