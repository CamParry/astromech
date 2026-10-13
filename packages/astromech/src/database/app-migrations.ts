/**
 * The app's migrations folder, for the steps that run where a file system
 * exists (the CLI and the Astro integration): where the folder is, and whether
 * the provider the config imports is the chain the folder's journal lists.
 */

import type { AstromechConfig } from '@/types/index';
import type { MigrationProvider } from 'kysely/migration';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createMergedProvider } from '@/database/migrations';
import { AstromechError } from '@/errors/astromech-error';

/** Resolve the config's `migrationsDir` against the working directory. */
export function resolveMigrationsDir(migrationsDir: string): string {
    return resolve(process.cwd(), migrationsDir);
}

/**
 * The config's chain merged with each plugin's, once `assertMatchesJournal`
 * passes. Null when the app has no migrations yet: `db:generate` has not run.
 */
export async function checkedMigrationProvider(
    config: Pick<AstromechConfig, 'migrations' | 'plugins'>,
    migrationsDir: string
): Promise<MigrationProvider | null> {
    const names = await assertMatchesJournal(config.migrations, migrationsDir);
    if (names.length === 0) return null;
    return createMergedProvider(config.migrations, config.plugins ?? []);
}

/**
 * Throw unless `provider` lists the migrations `<migrationsDir>/journal.json`
 * does, so a config that imports another folder than `migrationsDir` cannot
 * apply the wrong chain. A folder with no journal lists none. Returns the
 * provider's names.
 */
export async function assertMatchesJournal(
    provider: MigrationProvider,
    migrationsDir: string
): Promise<string[]> {
    const names = Object.keys(await provider.getMigrations());
    const journalPath = join(migrationsDir, 'journal.json');
    const journal = await readJournalTags(resolve(process.cwd(), journalPath));

    const onlyInProvider = names.filter((name) => !journal.includes(name));
    const onlyInJournal = journal.filter((tag) => !names.includes(tag));
    if (onlyInProvider.length === 0 && onlyInJournal.length === 0) return names;

    throw new AstromechError(
        `the config's \`migrations\` does not match ${journalPath}. ` +
            `Only in \`migrations\`: ${list(onlyInProvider)}. ` +
            `Only in the journal: ${list(onlyInJournal)}. ` +
            `Import \`migrationProvider\` from the \`index.ts\` in ${migrationsDir}, ` +
            'or set `migrationsDir` to the folder the config imports from. If the ' +
            'journal is the newer of the two, `astromech db:generate` rewrites `index.ts` from it.'
    );
}

/** The tags `journal.json` lists, or none when the file does not exist. */
async function readJournalTags(path: string): Promise<string[]> {
    let contents: string;
    try {
        contents = await readFile(path, 'utf-8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    const journal = JSON.parse(contents) as { entries: { tag: string }[] };
    return journal.entries.map((entry) => entry.tag);
}

function list(names: string[]): string {
    return names.length === 0 ? 'none' : names.join(', ');
}
