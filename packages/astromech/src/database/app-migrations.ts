/**
 * Loads the app-owned migration provider from the app's working directory.
 *
 * jiti rather than `import()`: the generated module and its siblings are
 * TypeScript, which plain Node cannot load.
 */

import { resolve } from 'node:path';
import type { MigrationProvider } from 'kysely';

/** Import `<cwd>/migrations/index.ts`. Throws if it is missing or malformed. */
export async function loadAppMigrations(
    cwd: string = process.cwd()
): Promise<MigrationProvider> {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(import.meta.url);
    const mod = (await jiti.import(resolve(cwd, 'migrations/index.ts'))) as {
        migrationProvider?: MigrationProvider;
    };
    if (!mod.migrationProvider) {
        throw new Error(
            `${resolve(cwd, 'migrations/index.ts')} does not export "migrationProvider". Run \`astromech db:generate\` to regenerate it.`
        );
    }
    return mod.migrationProvider;
}
