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
    // No module cache: `db:generate` rewrites `index.ts`, and a cached copy
    // would hide the migrations it added from a later load in the same process.
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const file = resolve(dir, 'index.ts');
    const mod = await jiti.import<{ migrationProvider?: MigrationProvider }>(file);
    if (!mod.migrationProvider) {
        throw new Error(
            `${file} does not export "migrationProvider". Run \`astromech db:generate\` to regenerate it.`
        );
    }
    return mod.migrationProvider;
}

/**
 * The names of the migrations in `<dir>/index.ts`, or null when there is none.
 * The Astro integration bundles them, so a runtime with no file system can
 * still check the database for pending migrations.
 */
export async function listAppMigrationNames(dir: string): Promise<string[] | null> {
    if (!(await hasAppMigrations(dir))) return null;
    const provider = await loadAppMigrations(dir);
    return Object.keys(await provider.getMigrations());
}

/** Whether `<dir>/index.ts` exists. False where the runtime has no filesystem to look in. */
export async function hasAppMigrations(dir: string): Promise<boolean> {
    try {
        const { access } = await import('node:fs/promises');
        await access(resolve(dir, 'index.ts'));
        return true;
    } catch {
        return false;
    }
}
