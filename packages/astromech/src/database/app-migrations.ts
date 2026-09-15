/**
 * Finds and loads the app-owned migration provider in the config's `migrationsDir`.
 * Uses jiti rather than `import()`: the generated module and its siblings
 * are TypeScript, which plain Node cannot load.
 */

import type { MigrationProvider } from 'kysely/migration';
import { resolve } from 'node:path';

/** Resolve the config's `migrationsDir` against the working directory. */
export function resolveMigrationsDir(migrationsDir: string): string {
    return resolve(process.cwd(), migrationsDir);
}

/** Import `<dir>/index.ts`. Throws if it is missing or malformed. */
export async function loadAppMigrations(dir: string): Promise<MigrationProvider> {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(import.meta.url);
    const file = resolve(dir, 'index.ts');
    const mod = (await jiti.import(file)) as {
        migrationProvider?: MigrationProvider;
    };
    if (!mod.migrationProvider) {
        throw new Error(
            `${file} does not export "migrationProvider". Run \`astromech db:generate\` to regenerate it.`
        );
    }
    return mod.migrationProvider;
}
