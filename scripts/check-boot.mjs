#!/usr/bin/env node
// Builds `apps/demo`, starts the built server, and makes real requests against
// it. This is the only check that runs the SSR runtime in its own process, so
// it is the only one that can see a server that cannot boot itself: the config
// phase and the runtime share a process under `astro dev`, which hides the
// failure entirely.
//
// A boot failure shows as 500 on `/` and 404 on `/cms`. The 404 is the
// misleading one — it reads like a routing mistake rather than an empty
// registry, so both are asserted.
//
// `/cms` returning 200 only proves the shell was served: it mounts
// `<AdminApp client:only="react" />`, so the React app has not been evaluated
// when the response is written. A browser step therefore loads `/cms` in
// headless chromium and waits for markup that only exists once React has
// painted. A broken import under `packages/admin/src/` reaches nothing else in
// the gate.
//
// The same page then goes past login. The scratch database has no users, so
// `/cms` sends the browser on to first-run setup, which creates the first
// account and signs it in. It asserts that account holds `admin`, and that a
// second sign-up from outside the page session answers 403. It then asserts the
// app shell's navigation, opens the `post` entries list from the sidebar,
// creates a post through the REST API with the page's session cookie, and opens
// that post's edit page. Last it opens the backups plugin's page, whose own
// component reads the admin's React context, which only works when the plugin
// and the admin share one copy of the kit, and calls the plugin's download raw
// route with the session. That covers the app shell, one list, one edit form,
// one plugin page and one plugin raw route. The other pages under
// `pages/_protected` are not loaded here. The browser steps are `scripts/admin-browser-check.mjs`,
// which `check:install` runs too.
//
// Slow (a full Astro build plus a browser), so it is run on demand and in CI,
// never from the pre-commit hook. It is not skippable: a check that can be
// turned off stops being evidence.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeAdminBrowser, expectAdminWorks } from './admin-browser-check.mjs';
import { expectStatus, freePort, run, step, waitForServer } from './check-helpers.mjs';
import { requireFreshDist } from './require-fresh-dist.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo');

let scratchDir = null;
let server = null;

async function main() {
    // This check builds only `apps/demo`, so a package `src` edit would
    // otherwise verify the previous package build.
    await requireFreshDist();

    // `apps/demo/database.db` is a working file, not a fixture. The check gets
    // its own migrated database in a temp directory and never touches that one.
    scratchDir = await mkdtemp(join(tmpdir(), 'astromech-check-boot-'));
    const databaseUrl = `file:${join(scratchDir, 'database.db')}`;

    // `ASTROMECH_LOG_CONFIG_EVAL` makes `apps/demo/astromech.config.ts` print a
    // line each time it is evaluated. The regression that would undo
    // roadmap/completed/runtime-boot-and-live-config.md is the config being
    // evaluated more than once per serving process, so the lines are counted.
    const env = {
        ...process.env,
        DATABASE_URL: databaseUrl,
        // `run` spawns with stdio: 'inherit', so any prompt a child package
        // manager raises reads a stdin that may not be a terminal and hangs.
        // This check is non-interactive by definition; say so.
        CI: 'true',
        ASTROMECH_LOG_CONFIG_EVAL: '1',
    };

    step('migrating a scratch database');
    await run('pnpm', ['-F', 'astromech-demo', 'db:init'], { cwd: repoRoot, env });

    step('building apps/demo');
    await run('pnpm', ['build'], { cwd: demoDir, env });

    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    step(`starting dist/server/entry.mjs on port ${port}`);
    // Better Auth refuses a sign-up or sign-in whose `Origin` is not its base
    // URL. The demo's `.env` names the dev server's origin, so the served one
    // is passed in for the browser step to sign up against.
    server = startServer({
        ...env,
        HOST: '127.0.0.1',
        PORT: String(port),
        BETTER_AUTH_URL: base,
    });
    await waitForServer(base, server);

    await expectStatus(`${base}/`, 200, 'the site renders');
    await expectStatus(`${base}/cms`, 200, 'the admin route is mounted');
    // 401 rather than 500 is the whole point: it proves the API is mounted and
    // rejecting an anonymous caller, not that the runtime never booted.
    await expectStatus(
        `${base}/cms/api/entries/post`,
        401,
        'the API rejects an anonymous read'
    );
    // A plugin's raw route answers 401 to an anonymous caller. An unmounted one
    // answers 401 too, from the API-wide `requireAuth` it falls through to, so
    // the browser step's signed-in request is what proves the route is mounted.
    await expectStatus(
        `${base}/cms/api/plugins/backups/runs/nope/download`,
        401,
        'a plugin raw route rejects an anonymous download'
    );

    const evaluations = server.output.match(/\[demo] config evaluated/g)?.length ?? 0;
    if (evaluations !== 1) {
        throw new Error(
            `config evaluated ${evaluations} times in the serving process, expected 1`
        );
    }
    console.log('  ok  the config is evaluated once per serving process');

    // Runs against the server already started above. A second one would double
    // the slowest part of the check and prove nothing extra.
    await expectAdminWorks(`${base}/cms`, { pluginPage: true, adminResource: true });
}

/**
 * The built server, with its output captured rather than inherited — the config
 * evaluation count is read back out of it, and it is only printed if the check
 * fails.
 */
function startServer(env) {
    const child = spawn('node', ['./dist/server/entry.mjs'], { cwd: demoDir, env });
    const handle = { child, output: '' };
    child.stdout.on('data', (chunk) => (handle.output += chunk));
    child.stderr.on('data', (chunk) => (handle.output += chunk));
    child.on('exit', (code) => {
        handle.exited = code;
    });
    return handle;
}

/**
 * Close the browser, kill the server and remove the scratch database on every
 * exit path. A live
 * child's pipes hold the event loop open, so the kill is waited on rather than
 * fired and forgotten, and escalated if the server ignores SIGTERM.
 */
async function cleanUp() {
    await closeAdminBrowser();
    if (server && server.exited === undefined) {
        const stopped = new Promise((fulfil) => server.child.once('exit', fulfil));
        server.child.kill('SIGTERM');
        const escalate = setTimeout(() => server.child.kill('SIGKILL'), 5000);
        await stopped;
        clearTimeout(escalate);
    }
    if (scratchDir) {
        await rm(scratchDir, { recursive: true, force: true });
    }
}

try {
    await main();
    console.log('\ncheck:boot passed');
} catch (error) {
    if (server) {
        console.error('\n--- server output ---');
        console.error(server.output);
    }
    console.error(`\ncheck:boot failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await cleanUp();
}
