/**
 * Builds `apps/demo`, starts the built server, and makes real requests against
 * it.
 *
 *     pnpm run check:boot
 *
 * The script runs it as a Turborepo task (`scripts/turbo.ts`), after the
 * builds of the packages the demo depends on (`^build`), so their `dist` is the
 * one their sources make. A run whose inputs match an earlier pass, in the
 * gate or by hand, is restored from the cache rather than run again.
 *
 * Exit codes: 0 when every step passed, 1 when one failed, 2 on a usage error.
 *
 * This is the only check that runs the SSR runtime in its own process, so it
 * is the only one that can see a server that cannot boot itself: the config
 * phase and the runtime share a process under `astro dev`, which hides the
 * failure entirely.
 *
 * A boot failure shows as 500 on `/` and 404 on `/cms`. The 404 is the
 * misleading one: it reads like a routing mistake rather than an empty
 * registry, so both are asserted.
 *
 * `/cms` returning 200 only proves the shell was served: it mounts
 * `<AdminApp client:only="react" />`, so the React app has not been evaluated
 * when the response is written. A browser step therefore loads `/cms` in
 * headless chromium and waits for markup that only exists once React has
 * painted. A broken import under `packages/admin/src/` reaches nothing else in
 * the gate.
 *
 * The same page then goes past login. The scratch database has no users, so
 * `/cms` sends the browser on to first-run setup, which creates the first
 * account and signs it in. It asserts that account holds `admin`, and that a
 * second sign-up from outside the page session answers 403. It then asserts the
 * app shell's navigation, opens the `post` entries list from the sidebar,
 * creates a post through the REST API with the page's session cookie, and opens
 * that post's edit page. Last it opens the backups plugin's page, whose own
 * component reads the admin's React context, which only works when the plugin
 * and the admin share one copy of the kit, and calls the plugin's download raw
 * route with the session. That covers the app shell, one list, one edit form,
 * one plugin page and one plugin raw route. The other pages under
 * `pages/_protected` are not loaded here. The browser steps are
 * `scripts/lib/admin-browser-check.ts`, which `check:install` runs too.
 *
 * Each run starts from nothing an earlier one left: the database is a new one
 * in a temp directory, migrated by `db:init`, and the build rewrites `dist`.
 * `apps/demo/database.db` is a working file, not a fixture, and the check
 * never touches it. Nothing the check does writes to the demo's uploads.
 *
 * The demo is built with Astro's default `security.csp`
 * (`apps/demo/astro.config.mjs`), so anything the admin does that the policy
 * blocks, such as adding a style element from script, fails the browser
 * steps. `check:install` runs them without a policy.
 *
 * The server runs as it does when deployed: with `NODE_ENV` unset, and with
 * `BETTER_AUTH_SECRET` from the environment or a throwaway value
 * (`scripts/lib/check-helpers.ts`), so the check needs nothing set by hand.
 *
 * Slow (a full Astro build plus a browser), so it is run on demand and in the
 * gate, never from the pre-commit hook. It is not skippable: a check that can
 * be turned off stops being evidence.
 */
import type { StartedProcess } from './lib/run.ts';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import console from 'node:console';
import { mkdtemp, rm } from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { closeAdminBrowser, expectAdminWorks } from './lib/admin-browser-check.ts';
import {
    betterAuthSecret,
    environmentWithoutNodeEnv,
    expectStatus,
    freePort,
    step,
    waitForServer,
} from './lib/check-helpers.ts';
import { relaunchAtLowerPriority } from './lib/cpu-limits.ts';
import { stopProcessGroup } from './lib/process-group.ts';
import { recordProcessGroups, waitForRunLock } from './lib/run-lock.ts';
import { run, start } from './lib/run.ts';

const NAME = 'check:boot';
const USAGE = 'usage: pnpm run check:boot';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo');

/** How long a stopped process gets to exit before SIGKILL. */
const STOP_GRACE_MS = 5000;

if (!parseArguments()) {
    process.exitCode = 2;
} else {
    process.exitCode = await check();
}

/**
 * Whether the arguments are valid: there are none. pnpm passes a `--` on to
 * the script, so every `--` is dropped.
 */
function parseArguments(): boolean {
    try {
        parseArgs({
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            strict: true,
            options: {},
        });
        return true;
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return false;
    }
}

/** Runs the check, and returns its exit code. */
async function check(): Promise<number> {
    // First, before anything prints: the build, server and browser inherit the
    // priority (`scripts/lib/cpu-limits.ts`).
    relaunchAtLowerPriority();

    // One heavy run at a time on this machine (`scripts/lib/run-lock.ts`).
    // Under `verify`, the gate holds the lock and this goes ahead.
    const ownsLock = await waitForRunLock(NAME);

    let scratchDir: string | undefined;
    let server: StartedProcess | undefined;

    /**
     * The commands and the server this check started. When this check holds
     * the lock, each leads a process group of its own, listed in the lock
     * file, so a run that finds this check killed outright waits for them too.
     * The group this check was started in could hold its caller as well, so it
     * is not the one listed. Under `verify` they stay in this check's group,
     * which the gate lists.
     */
    const children: ChildProcess[] = [];

    /**
     * Spawn options that give a child a process group of its own when this
     * check holds the lock. A process outside the terminal's foreground group
     * that reads from it is stopped, so such a child gets no stdin.
     */
    const groupOptions: SpawnOptions = ownsLock
        ? { detached: true, stdio: ['ignore', 'inherit', 'inherit'] }
        : {};

    function started(child: ChildProcess): void {
        // A child that could not be spawned has no pid, and nothing to stop.
        if (child.pid === undefined) return;
        children.push(child);
        if (ownsLock) {
            recordProcessGroups(
                children.flatMap((each) => (each.pid === undefined ? [] : [each.pid]))
            );
        }
    }

    /** Stops a child, with its process group when it leads one. */
    async function stop(child: ChildProcess): Promise<void> {
        if (ownsLock) return stopProcessGroup(child, STOP_GRACE_MS);
        if (child.exitCode !== null || child.signalCode !== null) return;
        const stopped = new Promise((fulfil) => child.once('exit', fulfil));
        child.kill('SIGTERM');
        const escalate = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
        await stopped;
        clearTimeout(escalate);
    }

    /**
     * Closes the browser, stops the server and any command still running, and
     * removes the scratch database on every exit path. A live child's pipes
     * hold the event loop open, so the stop is waited on rather than fired and
     * forgotten, and escalated if the child ignores SIGTERM.
     */
    async function cleanUp(): Promise<void> {
        await closeAdminBrowser();
        for (const child of children) await stop(child);
        if (scratchDir !== undefined) {
            await rm(scratchDir, { recursive: true, force: true });
        }
    }

    // A Ctrl-C, a closed terminal or `verify` stopping this check still closes
    // the browser, stops the server and any command, removes the scratch
    // database and releases the lock. A child in a process group of its own
    // gets neither the terminal's signals nor the gate's, so this is the only
    // way it stops.
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.once(signal, () => {
            void cleanUp().finally(() => process.exit(128 + constants.signals[signal]));
        });
    }

    async function main(): Promise<void> {
        scratchDir = await mkdtemp(join(tmpdir(), 'astromech-check-boot-'));
        const databaseUrl = `file:${join(scratchDir, 'database.db')}`;

        // `ASTROMECH_LOG_CONFIG_EVAL` makes `apps/demo/astromech.config.ts`
        // print a line each time it is evaluated. The regression that would
        // undo roadmap/completed/runtime-boot-and-live-config.md is the config
        // being evaluated more than once per serving process, so the lines are
        // counted.
        const env = {
            ...environmentWithoutNodeEnv(NAME),
            DATABASE_URL: databaseUrl,
            // `run` spawns with stdio: 'inherit', so any prompt a child package
            // manager raises reads a stdin that may not be a terminal and
            // hangs. This check is non-interactive by definition; say so.
            CI: 'true',
            ASTROMECH_LOG_CONFIG_EVAL: '1',
            // Builds with Astro's `security.csp` on (`apps/demo/astro.config.mjs`).
            SECURITY_CSP: '1',
        };

        step('migrating a scratch database');
        await run('pnpm', ['-F', 'astromech-demo', 'db:init'], {
            cwd: repoRoot,
            env,
            ...groupOptions,
            onSpawn: started,
        });

        step('building apps/demo');
        await run('pnpm', ['build'], {
            cwd: demoDir,
            env,
            ...groupOptions,
            onSpawn: started,
        });

        const port = await freePort();
        const base = `http://127.0.0.1:${port}`;
        step(`starting dist/server/entry.mjs on port ${port}`);
        // The built server, with its output kept rather than printed: the
        // config evaluation count is read back out of it, and it is printed
        // only if the check fails. Better Auth refuses a sign-up or sign-in
        // whose `Origin` is not its base URL. The demo's `.env` names the dev
        // server's origin, so the served one is passed in for the browser step
        // to sign up against.
        server = start('node', ['./dist/server/entry.mjs'], {
            cwd: demoDir,
            env: {
                ...env,
                HOST: '127.0.0.1',
                PORT: String(port),
                BETTER_AUTH_URL: base,
                BETTER_AUTH_SECRET: betterAuthSecret(),
            },
            detached: ownsLock,
        });
        started(server.child);
        await waitForServer(base, server);

        await expectStatus(`${base}/`, 200, 'the site renders');
        await expectStatus(`${base}/cms`, 200, 'the admin route is mounted');
        // 401 rather than 500 is the whole point: it proves the API is mounted
        // and rejecting an anonymous caller, not that the runtime never booted.
        await expectStatus(
            `${base}/cms/api/entries/post`,
            401,
            'the API rejects an anonymous read'
        );
        // A plugin's raw route answers 401 to an anonymous caller. An unmounted
        // one answers 401 too, from the API-wide `requireAuth` it falls through
        // to, so the browser step's signed-in request is what proves the route
        // is mounted.
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

        // Runs against the server already started above. A second one would
        // double the slowest part of the check and prove nothing extra.
        await expectAdminWorks(`${base}/cms`, { pluginPage: true, adminResource: true });
    }

    try {
        await main();
        console.log(`\nok   ${NAME}`);
        return 0;
    } catch (error) {
        if (server !== undefined) {
            console.error('\n--- server output ---');
            console.error(server.output);
        }
        console.error(`\nFAIL ${NAME}: ${(error as Error).message}`);
        return 1;
    } finally {
        await cleanUp();
    }
}
