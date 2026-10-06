#!/usr/bin/env node
/**
 * Keeps shallow clones of the projects Astromech compares itself against, so research can search
 * their source with `grep -rn` or `rg` instead of fetching it from the web one file at a time.
 * The clones live outside the repo in `Astromech-worktrees/.prior-art/<name>`, beside the main
 * checkout, which every worktree resolves to the same place, so they outlive a session and are
 * shared by all of them. They are for reading: an update discards any change made in one.
 *
 * `pnpm run prior-art` clones each project that is missing and updates the rest to the tip of
 * its default branch. `pnpm run prior-art <name> [<name>…]` does only those. It prints each
 * clone's path. Each clone has depth 1 and the default branch only, so it holds no history.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { run, step } from './check-helpers.mjs';

// Name and repository, one project a line. Each URL was checked with
// `git ls-remote --symref <url> HEAD`.
const PROJECTS = [
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

const names = process.argv.slice(2).filter((arg) => arg !== '--');
const unknown = names.filter((name) => !PROJECTS.some(([known]) => known === name));
if (unknown.length > 0) {
    console.error(
        `Unknown project: ${unknown.join(', ')}\n` +
            `Usage: prior-art [<name>…]\nProjects: ${PROJECTS.map(([name]) => name).join(', ')}`
    );
    process.exit(2);
}
const chosen =
    names.length === 0 ? PROJECTS : PROJECTS.filter(([name]) => names.includes(name));

// The main checkout's `.git` directory, whichever worktree this runs in.
const commonDir = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }
).trim();
const priorArtDir = join(
    dirname(dirname(commonDir)),
    'Astromech-worktrees',
    '.prior-art'
);
mkdirSync(priorArtDir, { recursive: true });

const failed = [];
for (const [name, url] of chosen) {
    const path = join(priorArtDir, name);
    try {
        if (existsSync(join(path, '.git'))) {
            step(`Updating ${name}`);
            await run('git', ['fetch', '--depth', '1', '--no-tags', 'origin', 'HEAD'], {
                cwd: path,
            });
            await run('git', ['reset', '--hard', '--quiet', 'FETCH_HEAD'], { cwd: path });
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
        console.error(`  ${name}: ${error.message}`);
        failed.push(name);
    }
}

console.log('');
for (const [name] of chosen) {
    if (!failed.includes(name)) console.log(join(priorArtDir, name));
}
if (failed.length > 0) {
    console.error(`\nFailed: ${failed.join(', ')}`);
    process.exit(1);
}
