/**
 * Keeps shallow clones of the projects Astromech compares itself against, so research can search
 * their source with `grep -rn` or `rg` instead of fetching it from the web one file at a time.
 * The clones live outside the repo in `<main checkout>-worktrees/.prior-art/<name>`, the
 * directory the worktrees sit in beside the main checkout (`Astromech-worktrees` for a checkout
 * named `Astromech`), which every worktree resolves to the same place, so they outlive a session
 * and are shared by all of them. The Bash hook (`.claude/hooks/guard-bash-commands.mjs`) works
 * out the same directory. They are for reading: an update discards any change made in one.
 *
 *     pnpm run prior-art [<name>…]
 *
 * With no names it clones each project that is missing and updates the rest to the tip of its
 * default branch; with names it does only those. It prints each clone's path. Each clone has
 * depth 1 and the default branch only, so it holds no history.
 *
 * Exit codes: 0 when every clone is current, 1 when one could not be cloned or updated, 2 on a
 * usage error, such as an unknown name.
 */
import console from 'node:console';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { step } from './lib/check-helpers.ts';
import { capture, run } from './lib/run.ts';

// Name and repository, one project a line. Each URL was checked with
// `git ls-remote --symref <url> HEAD`.
const PROJECTS: readonly (readonly [name: string, url: string])[] = [
    ['payload', 'https://github.com/payloadcms/payload.git'],
    ['strapi', 'https://github.com/strapi/strapi.git'],
    ['directus', 'https://github.com/directus/directus.git'],
    ['craft', 'https://github.com/craftcms/cms.git'],
    ['wordpress', 'https://github.com/WordPress/wordpress-develop.git'],
    ['sanity', 'https://github.com/sanity-io/sanity.git'],
    ['keystone', 'https://github.com/keystonejs/keystone.git'],
    ['adonisjs', 'https://github.com/adonisjs/core.git'],
    ['astro', 'https://github.com/withastro/astro.git'],
    ['tanstack-router', 'https://github.com/TanStack/router.git'],
    ['tanstack-query', 'https://github.com/TanStack/query.git'],
    ['hono', 'https://github.com/honojs/hono.git'],
    ['drizzle', 'https://github.com/drizzle-team/drizzle-orm.git'],
];

const USAGE = `usage: pnpm run prior-art [<name>…]
projects: ${PROJECTS.map(([name]) => name).join(', ')}`;

const chosen = parseArguments();
if (chosen === undefined) {
    process.exitCode = 2;
} else {
    process.exitCode = await update(chosen);
}

/**
 * The projects named, every project when none is, or undefined after printing
 * the usage. pnpm passes a `--` on to the script, so every `--` is dropped.
 */
function parseArguments(): typeof PROJECTS | undefined {
    try {
        const { positionals } = parseArgs({
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            strict: true,
            allowPositionals: true,
            options: {},
        });
        const unknown = positionals.filter(
            (name) => !PROJECTS.some(([known]) => known === name)
        );
        if (unknown.length > 0) throw new Error(`unknown project: ${unknown.join(', ')}`);
        return positionals.length === 0
            ? PROJECTS
            : PROJECTS.filter(([name]) => positionals.includes(name));
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return undefined;
    }
}

/** Clones or updates each project, prints the paths, and returns the exit code. */
async function update(projects: typeof PROJECTS): Promise<number> {
    // The main checkout's `.git` directory, whichever worktree this runs in.
    const commonDir = capture('git', [
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
    ]);
    const mainCheckout = dirname(commonDir);
    const priorArtDir = join(
        dirname(mainCheckout),
        `${basename(mainCheckout)}-worktrees`,
        '.prior-art'
    );
    mkdirSync(priorArtDir, { recursive: true });

    const failed: string[] = [];
    for (const [name, url] of projects) {
        const path = join(priorArtDir, name);
        try {
            if (existsSync(join(path, '.git'))) {
                step(`Updating ${name}`);
                await run(
                    'git',
                    ['fetch', '--depth', '1', '--no-tags', 'origin', 'HEAD'],
                    {
                        cwd: path,
                    }
                );
                await run('git', ['reset', '--hard', '--quiet', 'FETCH_HEAD'], {
                    cwd: path,
                });
            } else {
                step(`Cloning ${name} from ${url}`);
                await run('git', [
                    'clone',
                    '--depth',
                    '1',
                    '--single-branch',
                    '--no-tags',
                    url,
                    path,
                ]);
            }
        } catch (error) {
            console.error(`  ${name}: ${(error as Error).message}`);
            failed.push(name);
        }
    }

    console.log('');
    for (const [name] of projects) {
        if (!failed.includes(name)) console.log(join(priorArtDir, name));
    }
    if (failed.length > 0) {
        console.error(`\nFAIL prior-art: ${failed.join(', ')}`);
        return 1;
    }
    return 0;
}
