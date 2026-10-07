#!/usr/bin/env node
// Builds `apps/demo-cloudflare` and serves it on workerd through wrangler's
// local emulation, then makes real requests against it. `scripts/check-boot.mjs`
// does the same for Node; this is the only check that runs the runtime on the
// platform it claims equal standing with.
//
// What only this check can see: a binding that does not resolve, a module that
// does not load outside Node, and the `scheduled()` handler, which no HTTP
// request reaches. A Cron Trigger is not fired automatically in local
// development, so it is poked through the endpoint wrangler exposes for it.
//
// No browser step. `check:boot` already loads the admin in chromium, and the
// admin bundle is the same one either platform serves.
//
// D1 and R2 come from wrangler's local emulation, so this needs no Cloudflare
// account and no network. Both the build (which applies migrations through
// `getPlatformProxy()`) and the served Worker must be pointed at the same
// state directory, or the Worker boots against an empty database.
//
// Better Auth's secret reaches the Worker as a secret binding, the way a real
// one gets it: a deployment sets it with `wrangler secret put`, and `wrangler
// dev` reads it from `.dev.vars`. The check takes `BETTER_AUTH_SECRET` from its
// own environment, or a throwaway value when that sets none, as `check:boot`
// does (`scripts/check-helpers.mjs`), and hands it over in a scratch env file
// passed with `--env-file`, so no value is written into the app or committed.
// Without one the Worker refuses every request and `/` answers 500.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    betterAuthSecret,
    environmentWithoutNodeEnv,
    expectStatus,
    freePort,
    request,
    REQUEST_TIMEOUT_MS,
    sleep,
} from './check-helpers.mjs';
import { relaunchAtLowerPriority } from './cpu-limits.mjs';
import { stopProcessGroup } from './process-group.mjs';
import { requireFreshDist } from './require-fresh-dist.mjs';
import { recordProcessGroups, waitForRunLock } from './run-lock.mjs';

// First, before anything prints: the build and the server inherit the priority
// (`scripts/cpu-limits.mjs`).
relaunchAtLowerPriority();

// One heavy run at a time on this machine (`scripts/run-lock.mjs`). Under
// `verify`, the gate holds the lock and this goes ahead.
await waitForRunLock('check:boot:cloudflare');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo-cloudflare');
const stateDir = join(demoDir, '.wrangler', 'state');

const READY_ATTEMPTS = 60;
const READY_INTERVAL_MS = 500;

// A whole run takes under half a minute on a laptop, the build most of it.
// These leave room for a slow CI runner, and turn a hang into a failure that
// prints where it stopped.
const BUILD_TIMEOUT_MS = 4 * 60_000;
const CHECK_TIMEOUT_MS = 6 * 60_000;

/** How long a stopped process group gets to exit before SIGKILL. */
const STOP_GRACE_MS = 5000;

let scratchDir = null;
let server = null;
let runningCommand = null;
let currentStep = 'checking the package builds are current';

async function main() {
    // This check builds only `apps/demo-cloudflare`, so a package `src` edit
    // would otherwise verify the previous package build.
    await requireFreshDist();

    const env = {
        ...environmentWithoutNodeEnv('check:boot:cloudflare'),
        // `run` spawns with stdio: 'inherit', so any prompt a child package
        // manager raises reads a stdin that may not be a terminal and hangs.
        CI: 'true',
        // The check needs no network, so wrangler sends no usage data.
        WRANGLER_SEND_METRICS: 'false',
    };

    step('building apps/demo-cloudflare');
    await withDeadline(
        run('pnpm', ['build'], { cwd: demoDir, env }),
        BUILD_TIMEOUT_MS,
        () => `the build did not finish within ${minutes(BUILD_TIMEOUT_MS)}`
    );

    scratchDir = await mkdtemp(join(tmpdir(), 'astromech-check-boot-cloudflare-'));
    const envFile = join(scratchDir, 'secrets.env');
    await writeFile(envFile, `BETTER_AUTH_SECRET=${betterAuthSecret()}\n`);

    const port = await freePort();
    step(`serving the built Worker on workerd, port ${port}`);
    server = startWorker(port, env, envFile);
    recordRunning();

    const base = `http://127.0.0.1:${port}`;
    await waitForServer(base);

    await expectStatus(`${base}/`, 200, 'the site renders');
    await expectStatus(`${base}/cms`, 200, 'the admin route is mounted');
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
 * Four sign-ins with a password nobody has, from one address: three refused
 * passwords (401), then the limit (429). The fourth proves Better Auth's limiter
 * runs on workerd with `NODE_ENV` unset and counts in D1; a 500 is the request
 * copy or the count failing there.
 */
async function expectSignInLimited(base) {
    const url = `${base}/cms/api/auth/sign-in/email`;
    // Wrangler's local proxy keeps a `CF-Connecting-IP` the client sends, where
    // Cloudflare overwrites it. A fresh /64 per run keeps a count left in
    // `.wrangler/state` by a run in the last minute from carrying over.
    const address = `2001:db8:${randomGroup()}:${randomGroup()}::1`;
    const statuses = [];
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
                email: 'nobody@example.com',
                password: 'not-a-password',
            }),
            redirect: 'manual',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        statuses.push(response.status);
    }
    const expected = [401, 401, 401, 429];
    if (statuses.join() !== expected.join()) {
        throw new Error(
            `${url} returned ${statuses.join(', ')}, expected ${expected.join(', ')} — sign-ins are counted and limited`
        );
    }
    console.log(`  ok  ${statuses.join(', ')} ${url} — sign-ins are counted and limited`);
}

/** A random 16-bit IPv6 group, in hex. */
function randomGroup() {
    return Math.floor(Math.random() * 0x10000).toString(16);
}

function step(message) {
    currentStep = message;
    console.log(`\n> ${message}`);
}

/**
 * Run a command to completion, failing the check on a non-zero exit. It leads
 * its own process group, so `cleanUp` can stop everything it started.
 */
function run(file, args, options) {
    return new Promise((fulfil, reject) => {
        runningCommand = spawn(file, args, {
            stdio: 'inherit',
            detached: true,
            ...options,
        });
        recordRunning();
        runningCommand.on('error', reject);
        runningCommand.on('exit', (code) => {
            if (code === 0) fulfil();
            else reject(new Error(`${file} ${args.join(' ')} exited with ${code}`));
        });
    });
}

/**
 * Reject with the message `describe()` returns if `promise` has not settled
 * within `ms`. The error is marked `timedOut`.
 */
function withDeadline(promise, ms, describe) {
    let timer;
    const deadline = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(Object.assign(new Error(describe()), { timedOut: true })),
            ms
        );
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function minutes(ms) {
    return `${ms / 60_000} minutes`;
}

/**
 * `wrangler dev` over the config the Astro build emitted, which names the
 * built entry and carries the bindings across from `wrangler.jsonc`, with the
 * secrets from `envFile`. Output is captured rather than inherited, and printed
 * only if the check fails. `npx` starts wrangler and wrangler starts workerd,
 * so the child leads its own process group and `cleanUp` stops all three.
 */
function startWorker(port, env, envFile) {
    const child = spawn(
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
    const handle = { child, output: '' };
    child.stdout.on('data', (chunk) => (handle.output += chunk));
    child.stderr.on('data', (chunk) => (handle.output += chunk));
    child.on('exit', (code) => {
        handle.exited = code;
    });
    return handle;
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
function recordRunning() {
    recordProcessGroups(
        [runningCommand, server?.child]
            .map((child) => child?.pid)
            .filter((pid) => pid !== undefined)
    );
}

async function waitForServer(base) {
    // Distinguishes the two ways this loop runs out: nothing ever listened, or
    // something listened and would not answer.
    let connected = false;
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
        if (server.exited !== undefined) {
            throw new Error(`wrangler exited with ${server.exited} before serving`);
        }
        try {
            await request(base);
            return;
        } catch (error) {
            if (error.name === 'TimeoutError') connected = true;
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
 * Stop the build and wrangler, with everything they started, on every exit
 * path. A live process holding this script's pipes keeps its event loop open,
 * so the stop is waited on rather than fired and forgotten.
 */
async function cleanUp() {
    if (runningCommand) await stopProcessGroup(runningCommand, STOP_GRACE_MS);
    if (server) await stopProcessGroup(server.child, STOP_GRACE_MS);
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true });
}

// The build and wrangler run in process groups of their own, so neither a
// Ctrl-C, a closed terminal nor `verify` stopping this check reaches them.
// Stop them here.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
        void cleanUp().finally(() => process.exit(128 + constants.signals[signal]));
    });
}

let timedOut = false;
try {
    await withDeadline(
        main(),
        CHECK_TIMEOUT_MS,
        () => `timed out after ${minutes(CHECK_TIMEOUT_MS)}, at step: ${currentStep}`
    );
    console.log('\ncheck:boot:cloudflare passed');
} catch (error) {
    if (server) {
        console.error('\n--- wrangler output ---');
        console.error(server.output);
    }
    console.error(`\ncheck:boot:cloudflare failed: ${error.message}`);
    process.exitCode = 1;
    timedOut = error.timedOut === true;
} finally {
    await cleanUp();
}

// A deadline leaves `main` mid-step, and whatever it was waiting on may still
// hold the event loop open. The exit waits so the output above can reach a
// piped stderr first; `unref` lets a process with nothing left exit sooner.
if (timedOut) setTimeout(() => process.exit(), 10_000).unref();
