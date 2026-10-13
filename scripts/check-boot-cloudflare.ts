/**
 * Builds `apps/demo-cloudflare` and serves it on workerd through wrangler's
 * local emulation, then makes real requests against it.
 *
 *     pnpm run check:boot:cloudflare
 *
 * The script runs it as a Turborepo task (`scripts/turbo.ts`), after the
 * builds of the packages the Cloudflare demo depends on (`^build`), so their `dist` is the
 * one their sources make. A run whose inputs match an earlier pass, in the
 * gate or by hand, is restored from the cache rather than run again.
 *
 * Exit codes: 0 when every step passed, 1 when one failed or the check timed
 * out, 2 on a usage error.
 *
 * `scripts/check-boot.ts` does the same for Node; this is the only check that
 * runs the runtime on the platform it claims equal standing with.
 *
 * What only this check can see: a binding that does not resolve, a module that
 * does not load outside Node, and the `scheduled()` handler, which no HTTP
 * request reaches. A Cron Trigger is not fired automatically in local
 * development, so it is poked through the endpoint wrangler exposes for it.
 *
 * No browser step. `check:boot` already loads the admin in chromium, and the
 * admin bundle is the same one either platform serves.
 *
 * The app is built with Astro's `security.csp` on, and every inline script
 * `/cms` serves must have its hash in the policy it sends.
 *
 * D1 and R2 come from wrangler's local emulation, so this needs no Cloudflare
 * account and no network. Each run serves the Worker from new state: a temp
 * directory holding a copy of `wrangler.jsonc`, a link to the app's
 * `migrations`, and the `.wrangler/state` that `db:init`, run there, migrates.
 * Wrangler keeps that state beside the config it finds (`getPlatformProxy()`
 * takes no other place from `db:init`), and `wrangler dev` is given it with
 * `--persist-to`. So nothing an earlier run left, such as a database migrated
 * by a baseline since edited, or refused sign-ins still counted, reaches this
 * one, and the app's own `.wrangler/state` is never served. The build still
 * applies pending migrations to that one, as every `astro build` of the app
 * does (`astro:build:start`), since nothing tells it to look elsewhere.
 *
 * Better Auth's secret reaches the Worker as a secret binding, the way a real
 * one gets it: a deployment sets it with `wrangler secret put`, and `wrangler
 * dev` reads it from `.dev.vars`. The check takes `BETTER_AUTH_SECRET` from its
 * own environment, or a throwaway value when that sets none, as `check:boot`
 * does (`scripts/lib/check-helpers.ts`), and hands it over in a scratch env
 * file passed with `--env-file`, so no value is written into the app or
 * committed. Without one the Worker refuses every request and `/` answers 500.
 *
 * The Worker reads the app's migration chain from the config, which imports
 * it, so it needs no file system. To see that, the check adds a migration the
 * database lacks beside the chain's in the built bundle, and expects the
 * Worker's boot to report it pending. `cleanUp` restores the chunk.
 */
import type { StartedProcess } from './lib/run.ts';
import type { ChildProcess } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import {
    copyFile,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
    betterAuthSecret,
    environmentWithoutNodeEnv,
    expectStatus,
    freePort,
    request,
    REQUEST_TIMEOUT_MS,
    sleep,
} from './lib/check-helpers.ts';
import { relaunchAtLowerPriority } from './lib/cpu-limits.ts';
import { stopProcessGroup } from './lib/process-group.ts';
import { recordProcessGroups, waitForRunLock } from './lib/run-lock.ts';
import { run, start } from './lib/run.ts';

const NAME = 'check:boot:cloudflare';
const USAGE = 'usage: pnpm run check:boot:cloudflare';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo-cloudflare');
const serverDir = join(demoDir, 'dist', 'server');
const coreDir = join(repoRoot, 'packages', 'astromech');

/** The migration the check adds to the bundled chain, which no database has applied. */
const UNAPPLIED_MIGRATION = '9999_check_boot_unapplied';

const READY_ATTEMPTS = 60;
const READY_INTERVAL_MS = 500;

// A whole run takes under half a minute on a laptop, the build most of it.
// These leave room for a slow CI runner, and turn a hang into a failure that
// prints where it stopped.
const BUILD_TIMEOUT_MS = 4 * 60_000;
const MIGRATE_TIMEOUT_MS = 2 * 60_000;
const CHECK_TIMEOUT_MS = 6 * 60_000;

/** How long a stopped process group gets to exit before SIGKILL. */
const STOP_GRACE_MS = 5000;

/** A failure raised by `withDeadline`. */
class TimeoutError extends Error {}

let scratchDir: string | undefined;
let server: StartedProcess | undefined;
let runningCommand: ChildProcess | undefined;
let currentStep = 'starting';
/** The bundle chunk `addUnappliedMigration` changed, and its built source. */
let patchedChunk: { path: string; source: string } | undefined;

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
    // First, before anything prints: the build and the server inherit the
    // priority (`scripts/lib/cpu-limits.ts`).
    relaunchAtLowerPriority();

    // One heavy run at a time on this machine (`scripts/lib/run-lock.ts`).
    // Under `verify`, the gate holds the lock and this goes ahead.
    await waitForRunLock(NAME);

    // The build and wrangler run in process groups of their own, so neither a
    // Ctrl-C, a closed terminal nor `verify` stopping this check reaches them.
    // Stop them here.
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.once(signal, () => {
            void cleanUp().finally(() => process.exit(128 + constants.signals[signal]));
        });
    }

    let timedOut = false;
    let code = 1;
    try {
        await withDeadline(
            main(),
            CHECK_TIMEOUT_MS,
            () => `timed out after ${minutes(CHECK_TIMEOUT_MS)}, at step: ${currentStep}`
        );
        console.log(`\nok   ${NAME}`);
        code = 0;
    } catch (error) {
        if (server !== undefined) {
            console.error('\n--- wrangler output ---');
            console.error(server.output);
        }
        console.error(`\nFAIL ${NAME}: ${(error as Error).message}`);
        timedOut = error instanceof TimeoutError;
    } finally {
        await cleanUp();
    }

    // A deadline leaves `main` mid-step, and whatever it was waiting on may
    // still hold the event loop open. The exit waits so the output above can
    // reach a piped stderr first; `unref` lets a process with nothing left
    // exit sooner.
    if (timedOut) setTimeout(() => process.exit(), 10_000).unref();
    return code;
}

async function main(): Promise<void> {
    const env = {
        ...environmentWithoutNodeEnv(NAME),
        // `run` spawns with stdio: 'inherit', so any prompt a child package
        // manager raises reads a stdin that may not be a terminal and hangs.
        CI: 'true',
        // The check needs no network, so wrangler sends no usage data.
        WRANGLER_SEND_METRICS: 'false',
        // Builds with Astro's `security.csp` on (`apps/demo-cloudflare/astro.config.mjs`).
        SECURITY_CSP: '1',
    };

    step('building apps/demo-cloudflare');
    await withDeadline(
        run('pnpm', ['build'], {
            cwd: demoDir,
            env,
            // Its own process group, so `cleanUp` stops everything it started.
            detached: true,
            onSpawn: (child) => {
                runningCommand = child;
                recordRunning();
            },
        }),
        BUILD_TIMEOUT_MS,
        () => `the build did not finish within ${minutes(BUILD_TIMEOUT_MS)}`
    );
    await expectCleanBundle();
    await addUnappliedMigration();

    scratchDir = await mkdtemp(join(tmpdir(), 'astromech-check-boot-cloudflare-'));
    const envFile = join(scratchDir, 'secrets.env');
    await writeFile(envFile, `BETTER_AUTH_SECRET=${betterAuthSecret()}\n`);

    step('migrating a scratch database');
    const stateDir = await migrateScratchState(join(scratchDir, 'project'), env);

    const port = await freePort();
    step(`serving the built Worker on workerd, port ${port}`);
    server = startWorker(port, env, envFile, stateDir);
    recordRunning();

    const base = `http://127.0.0.1:${port}`;
    await waitForWorker(base, server);

    await expectHtml(`${base}/`, 'the site renders');
    await expectPendingMigrationReported(server);
    await expectHtml(`${base}/cms`, 'the admin route is mounted');
    await expectInlineScriptsHashed(`${base}/cms`);
    // 401 rather than 500 proves the API is mounted and rejecting an anonymous
    // caller, not that the runtime never booted against its D1 binding.
    await expectStatus(
        `${base}/cms/api/entries/post`,
        401,
        'the API rejects an anonymous read'
    );

    // The endpoint wrangler exposes to fire `scheduled()` by hand. A 200 means
    // the Worker entry exported the handler and the tick reached the cron
    // table, which is the whole of the Cron Trigger path. A 500 carries the
    // outcome (`exception` when the tick threw, logged above as an uncaught
    // error) or the error that kept the tick from reaching the Worker.
    await expectStatus(
        `${base}/cdn-cgi/local/scheduled`,
        200,
        'the Cron Trigger runs a tick'
    );
    // Last, because the 429 answers before the request body is read. Wrangler's
    // dev proxy can then send the next request down the connection workerd
    // closed for it, and that request fails with a 500 "Network connection
    // lost." without reaching the Worker. A loaded machine makes it likely.
    await expectSignInLimited(base);
}

/**
 * Make `projectDir` a wrangler project of the app's bindings, run the app's
 * `db:init` from it, and return the state directory it migrated, for
 * `wrangler dev --persist-to`. `db:init` reads the app's config by its path,
 * and its `migrationsDir`, `./migrations`, from the working directory, which
 * links to the app's.
 */
async function migrateScratchState(
    projectDir: string,
    env: NodeJS.ProcessEnv
): Promise<string> {
    await mkdir(projectDir);
    await copyFile(join(demoDir, 'wrangler.jsonc'), join(projectDir, 'wrangler.jsonc'));
    await symlink(join(demoDir, 'migrations'), join(projectDir, 'migrations'));
    // The app's `db:init` script, with each path made absolute.
    await withDeadline(
        run(
            join(demoDir, 'node_modules', '.bin', 'tsx'),
            [
                '--tsconfig',
                join(coreDir, 'tsconfig.json'),
                join(coreDir, 'src', 'transport', 'cli', 'index.ts'),
                'db:init',
                '--config',
                join(demoDir, 'astromech.config.ts'),
            ],
            {
                cwd: projectDir,
                env,
                detached: true,
                onSpawn: (child) => {
                    runningCommand = child;
                    recordRunning();
                },
            }
        ),
        MIGRATE_TIMEOUT_MS,
        () => `db:init did not finish within ${minutes(MIGRATE_TIMEOUT_MS)}`
    );
    return join(projectDir, '.wrangler', 'state');
}

/** The built Worker's chunks, with their source. */
async function serverChunks(): Promise<{ path: string; source: string }[]> {
    const files = (await readdir(serverDir, { recursive: true })).filter((file) =>
        file.endsWith('.mjs')
    );
    return Promise.all(
        files.map(async (file) => {
            const path = join(serverDir, file);
            return { path, source: await readFile(path, 'utf8') };
        })
    );
}

/**
 * Two checks on the built Worker's code, before it is served.
 *
 * One copy of core: the site's Vite resolves every core subpath to source
 * (`astromech:core-source-alias`). A subpath left on `dist` puts a second copy
 * beside it, and an error class from one copy fails an `instanceof` check in
 * the other. `createRegistry` stands in for the whole package.
 *
 * No build-machine environment: Astro inlines into a module that reads
 * `import.meta.env` as a whole object every variable whose name appears in its
 * source, which once put the `NODE` variable, the path of the build's Node
 * binary, in the bundle. That path stands in for the rest.
 */
async function expectCleanBundle(): Promise<void> {
    const chunks = await serverChunks();
    const named = (list: { path: string }[]): string =>
        list.map(({ path }) => path.slice(serverDir.length + 1)).join(', ');
    const copies = chunks.filter(({ source }) =>
        source.includes('function createRegistry(')
    );
    if (copies.length !== 1) {
        throw new Error(
            `dist/server holds ${copies.length} copies of core's createRegistry, expected 1: ${named(copies)}`
        );
    }
    console.log('  ok  dist/server holds one copy of core');
    const leaked = chunks.filter(({ source }) => source.includes(process.execPath));
    if (leaked.length > 0) {
        throw new Error(
            `the build machine's Node path (${process.execPath}) is in ${named(leaked)}`
        );
    }
    console.log('  ok  dist/server holds no build-machine Node path');
}

/**
 * Add `UNAPPLIED_MIGRATION` to the app's chain in the built Worker, next to
 * the first migration in `migrations/journal.json`, which the build applied.
 */
async function addUnappliedMigration(): Promise<void> {
    const journal = JSON.parse(
        await readFile(join(demoDir, 'migrations', 'journal.json'), 'utf8')
    ) as { entries: { tag: string }[] };
    const applied = journal.entries[0]?.tag;
    if (applied === undefined) {
        throw new Error(
            'apps/demo-cloudflare/migrations/journal.json lists no migration'
        );
    }
    const entry = new RegExp(`(["'])${applied}\\1\\s*:\\s*[\\w$]+`);
    const found = (await serverChunks()).filter(({ source }) => entry.test(source));
    const [chunk] = found;
    if (found.length !== 1 || chunk === undefined) {
        throw new Error(
            `dist/server holds the migration chain's "${applied}" entry in ${found.length} chunks, expected 1`
        );
    }
    patchedChunk = chunk;
    await writeFile(
        chunk.path,
        chunk.source.replace(
            entry,
            (match) => `${match}, "${UNAPPLIED_MIGRATION}": { up: async () => {} }`
        )
    );
    console.log(
        `  ok  dist/server bundles the migration chain; added ${UNAPPLIED_MIGRATION}`
    );
}

/**
 * Fail unless the Worker's boot, which the first request started, reported
 * `UNAPPLIED_MIGRATION` pending: its chain is the one the config imports.
 */
async function expectPendingMigrationReported(worker: StartedProcess): Promise<void> {
    const warning = `1 migration has not been applied to this database: ${UNAPPLIED_MIGRATION}`;
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
        if (worker.output.includes(warning)) {
            console.log(
                `  ok  the Worker's boot reported ${UNAPPLIED_MIGRATION} pending`
            );
            return;
        }
        await sleep(READY_INTERVAL_MS);
    }
    throw new Error(`the Worker never logged "${warning}"`);
}

/**
 * Fail unless `url` answers 200 with an HTML document. Under a compatibility
 * date before 2026-02-19, workerd turns the async iterable Astro streams a page
 * as into the text "[object Object]", and every page still answers 200.
 */
async function expectHtml(url: string, description: string): Promise<void> {
    const response = await request(url);
    const body = await response.text();
    if (response.status !== 200 || !/^<!doctype html>/i.test(body.trimStart())) {
        throw new Error(
            `${url} returned ${response.status} with ${JSON.stringify(body.slice(0, 200))}, expected an HTML document — ${description}`
        );
    }
    console.log(`  ok  200 ${url} — ${description}`);
}

/**
 * Every inline script `url` serves has its hash in the `script-src` of the
 * policy Astro sends, the admin's theme script among them: Astro hashes only
 * the scripts it bundles, and the admin's shell adds its own.
 */
async function expectInlineScriptsHashed(url: string): Promise<void> {
    const response = await request(url);
    const policy = response.headers.get('content-security-policy') ?? '';
    const scriptSrc = policy
        .split(';')
        .map((directive) => directive.trim())
        .find((directive) => directive.startsWith('script-src '));
    if (scriptSrc === undefined) {
        throw new Error(`${url} sent no script-src in its policy: "${policy}"`);
    }
    const html = await response.text();
    const inline = [
        ...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ];
    const missing = inline.filter(
        ([, source = '']) =>
            !scriptSrc.includes(
                `'sha256-${createHash('sha256').update(source).digest('base64')}'`
            )
    );
    if (inline.length === 0 || missing.length > 0) {
        throw new Error(
            `${url}: ${missing.length} of ${inline.length} inline scripts have no hash in "${scriptSrc}":\n` +
                missing.map(([tag]) => tag.slice(0, 200)).join('\n')
        );
    }
    console.log(
        `  ok  ${url} — its ${inline.length} inline scripts are hashed in its script-src`
    );
}

/**
 * Four sign-ins with a password nobody has, from one address: three refused
 * passwords (401), then the limit (429). The fourth proves Better Auth's limiter
 * runs on workerd with `NODE_ENV` unset and counts in D1; a 500 is the request
 * copy or the count failing there.
 */
async function expectSignInLimited(base: string): Promise<void> {
    const url = `${base}/cms/api/auth/sign-in/email`;
    // Wrangler's local proxy keeps a `CF-Connecting-IP` the client sends, where
    // Cloudflare overwrites it. The state is new each run, so no count from an
    // earlier run carries over: neither the address's nor the account's, whose
    // fifth refusal in 15 minutes locks it with a 429 of its own (`ACCOUNT_LOCK`
    // in `packages/astromech/src/security/sign-in-failures.ts`).
    const address = '2001:db8::1';
    const email = 'nobody@example.com';
    const statuses: number[] = [];
    const codes: string[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetch(url, {
            method: 'POST',
            // Better Auth refuses a sign-in without an `Origin` it trusts. With
            // no `BETTER_AUTH_URL` here, it trusts the origin the request came to.
            headers: {
                'Content-Type': 'application/json',
                Origin: base,
                'CF-Connecting-IP': address,
            },
            body: JSON.stringify({
                email,
                password: 'not-a-password',
            }),
            redirect: 'manual',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        statuses.push(response.status);
        codes.push(await errorCode(response));
    }
    const expected = [401, 401, 401, 429];
    if (statuses.join() !== expected.join()) {
        // The codes tell the rate limiter's 429 (no code) from an account
        // lock's (`ACCOUNT_LOCKED`).
        throw new Error(
            `${url} returned ${statuses.join(', ')} (codes ${codes.join(', ')}), expected ${expected.join(', ')} — sign-ins are counted and limited`
        );
    }
    console.log(`  ok  ${statuses.join(', ')} ${url} — sign-ins are counted and limited`);
}

/** The `code` of a Better Auth error body, or `none`. */
async function errorCode(response: Response): Promise<string> {
    try {
        const body = JSON.parse(await response.text()) as { code?: unknown } | null;
        return typeof body?.code === 'string' ? body.code : 'none';
    } catch {
        return 'none';
    }
}

/** Print the line that opens a step, and remember it for a timeout's message. */
function step(message: string): void {
    currentStep = message;
    console.log(`\n> ${message}`);
}

/**
 * Reject with a `TimeoutError` carrying the message `describe()` returns if
 * `promise` has not settled within `ms`.
 */
function withDeadline<T>(
    promise: Promise<T>,
    ms: number,
    describe: () => string
): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(describe())), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function minutes(ms: number): string {
    return `${ms / 60_000} minutes`;
}

/**
 * `wrangler dev` over the config the Astro build emitted, which names the
 * built entry and carries the bindings across from `wrangler.jsonc`, with the
 * secrets from `envFile` and the state `migrateScratchState` made in
 * `stateDir`. Output is kept rather than printed, and printed
 * only if the check fails. `npx` starts wrangler and wrangler starts workerd,
 * so the child leads its own process group and `cleanUp` stops all three.
 */
function startWorker(
    port: number,
    env: NodeJS.ProcessEnv,
    envFile: string,
    stateDir: string
): StartedProcess {
    return start(
        'npx',
        [
            'wrangler',
            'dev',
            '-c',
            join('dist', 'server', 'wrangler.json'),
            '--local',
            '--ip',
            '127.0.0.1',
            '--port',
            String(port),
            '--persist-to',
            stateDir,
            '--env-file',
            envFile,
        ],
        { cwd: demoDir, env, detached: true }
    );
}

/**
 * Lists the build's and wrangler's process groups in the lock file when this
 * check holds the lock, so a run that finds this check killed outright waits
 * for them too. A group whose leader has exited stays listed: a process it
 * started may still be running, and an empty group counts as not running.
 * Under `verify` the lock file is the gate's and this does nothing
 * (`recordProcessGroups`): the gate lists this check's own group, and while
 * this check runs it stops the build and wrangler on every exit path but being
 * killed outright.
 */
function recordRunning(): void {
    recordProcessGroups(
        [runningCommand, server?.child].flatMap((child) =>
            child?.pid === undefined ? [] : [child.pid]
        )
    );
}

/** Wait until the Worker answers a request with any status. */
async function waitForWorker(base: string, worker: StartedProcess): Promise<void> {
    // Distinguishes the two ways this loop runs out: nothing ever listened, or
    // something listened and would not answer.
    let connected = false;
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
        if (worker.exited !== undefined) {
            throw new Error(`wrangler exited with ${worker.exited} before serving`);
        }
        try {
            await request(base);
            return;
        } catch (error) {
            if ((error as Error).name === 'TimeoutError') connected = true;
            await sleep(READY_INTERVAL_MS);
        }
    }
    throw new Error(
        connected
            ? `the Worker accepted connections but never answered one (${base}) — see the output above`
            : `wrangler never opened its port (${base})`
    );
}

/**
 * Stop the build, `db:init` and wrangler, with everything they started,
 * restore the chunk `addUnappliedMigration` changed, and remove the scratch
 * directory and the state in it, on every exit path. A live process
 * holding this script's pipes keeps its event loop open, so the stop is
 * waited on rather than fired and forgotten.
 */
async function cleanUp(): Promise<void> {
    if (runningCommand !== undefined)
        await stopProcessGroup(runningCommand, STOP_GRACE_MS);
    if (server !== undefined) await stopProcessGroup(server.child, STOP_GRACE_MS);
    if (patchedChunk !== undefined)
        await writeFile(patchedChunk.path, patchedChunk.source);
    if (scratchDir !== undefined) await rm(scratchDir, { recursive: true, force: true });
}
