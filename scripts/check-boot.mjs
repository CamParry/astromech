#!/usr/bin/env node
// Builds `apps/demo`, starts the built server, and makes real requests against
// it. This is the only check that runs the SSR runtime in its own process, so
// it is the only one that can see a server that cannot boot itself: the config
// phase and the runtime share a process under `astro dev`, which hides the
// failure entirely.
//
// A boot failure shows as 500 on `/` and 404 on `/admin`. The 404 is the
// misleading one — it reads like a routing mistake rather than an empty
// registry, so both are asserted.
//
// `/admin` returning 200 only proves the shell was served: it mounts
// `<AdminApp client:only="react" />`, so the React app has not been evaluated
// when the response is written. A browser step therefore loads `/admin` in
// headless chromium and waits for markup that only exists once React has
// painted. A broken import under `src/admin/` reaches nothing else in the gate.
//
// The browser step stops BEFORE login: it asserts the unauthenticated screen
// rendered and nothing more. Everything behind login — the app shell, the
// entries list, every page under `pages/_protected` — is untested here.
//
// Slow (a full Astro build plus a browser), so it is run on demand and in CI,
// never from the pre-commit hook. It is not skippable: a check that can be
// turned off stops being evidence.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo');

/** Requests to give the server to open its port before giving up. */
const READY_ATTEMPTS = 60;
const READY_INTERVAL_MS = 500;

// Every request is given a deadline because `fetch` has none of its own. A
// server that accepts the connection and then never answers would otherwise
// hang this check forever: the retry loop below is bounded, but it only gets
// to count an attempt once the request settles. That is not hypothetical — the
// node adapter responds to an unhandled rejection during render by logging it
// and leaving the socket open, so a boot defect presents as a hang rather than
// as the failure this check exists to report.
const REQUEST_TIMEOUT_MS = 10_000;

// The admin fetches its session before it can decide which screen to show, so
// the mounted-app selector arrives a round trip after navigation, not with it.
const MOUNT_TIMEOUT_MS = 30_000;

// `#am-app` is the router root (`admin/pages/__root.tsx`) and the password
// field belongs to the unauthenticated screen — login, or the first-run setup
// form on an empty database. Neither can exist in the served shell, and the
// pair distinguishes a painted screen from the pending placeholder the auth
// layout renders while the session query is in flight.
const MOUNTED_SELECTOR = '#am-app form input[type="password"]';

let scratchDir = null;
let server = null;
let browser = null;

async function main() {
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
    step(`starting dist/server/entry.mjs on port ${port}`);
    server = startServer({ ...env, HOST: '127.0.0.1', PORT: String(port) });

    const base = `http://127.0.0.1:${port}`;
    await waitForServer(base);

    await expectStatus(`${base}/`, 200, 'the site renders');
    await expectStatus(`${base}/admin`, 200, 'the admin route is mounted');
    // 401 rather than 500 is the whole point: it proves the API is mounted and
    // rejecting an anonymous caller, not that the runtime never booted.
    await expectStatus(
        `${base}/api/entries/post`,
        401,
        'the API rejects an anonymous read'
    );

    const evaluations = server.output.match(/\[demo] config evaluated/g)?.length ?? 0;
    if (evaluations !== 1) {
        throw new Error(
            `config evaluated ${evaluations} times in the serving process, expected 1`
        );
    }
    console.log('  ok  the config is evaluated once per serving process');

    await expectAdminMounts(`${base}/admin`);
}

/**
 * Load `/admin` in headless chromium and assert the React app rendered.
 *
 * Runs against the server already started above — a second one would double
 * the slowest part of the check and prove nothing extra.
 */
async function expectAdminMounts(url) {
    step('loading /admin in headless chromium');
    const { chromium } = await import('playwright');

    try {
        browser = await chromium.launch();
    } catch (error) {
        // The npm install brings the driver, not the browser binary.
        throw new Error(
            `could not launch chromium — run \`pnpm exec playwright install chromium\` (${error.message})`
        );
    }

    const page = await browser.newPage();

    // A broken import surfaces as a console error or an uncaught page error,
    // not as a missing element, so both are collected from before navigation
    // and reported after the mount assertion — the mount failure is the more
    // useful message when they happen together.
    //
    // The unauthenticated admin asks `/api/me` who it is and is answered 401,
    // by design, and chromium logs every failed response as a console error.
    // Those messages carry no JavaScript arguments because no script emitted
    // them; anything `console.error` produced does. So argument-less messages
    // are recorded for the diagnostics but do not fail the check on their own —
    // a resource that genuinely failed to load takes the mount assertion with
    // it, which is where they get printed.
    const errors = [];
    const notes = [];
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const line = `console: ${message.text()} (${message.location().url})`;
        if (message.args().length === 0) notes.push(line);
        else errors.push(line);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto(url, { waitUntil: 'commit', timeout: REQUEST_TIMEOUT_MS });

    try {
        await page.waitForSelector(MOUNTED_SELECTOR, { timeout: MOUNT_TIMEOUT_MS });
    } catch {
        throw new Error(
            `the admin never rendered \`${MOUNTED_SELECTOR}\` at ${url}${formatLines([...errors, ...notes])}`
        );
    }
    console.log('  ok  the admin app mounts and renders its unauthenticated screen');

    if (errors.length > 0) {
        throw new Error(`the admin reported errors in the browser${formatLines(errors)}`);
    }
    console.log('  ok  the admin logs no console or page errors');
}

function formatLines(lines) {
    if (lines.length === 0) return '';
    return `\n${lines.map((line) => `      ${line}`).join('\n')}`;
}

function step(message) {
    console.log(`\n> ${message}`);
}

/** Run a command to completion, failing the check on a non-zero exit. */
function run(command, args, options) {
    return new Promise((fulfil, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', ...options });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) fulfil();
            else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
        });
    });
}

/** A port the OS just told us is free. Raced in principle, never in practice. */
function freePort() {
    return new Promise((fulfil, reject) => {
        const probe = createServer();
        probe.on('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => fulfil(port));
        });
    });
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

async function waitForServer(base) {
    // Distinguishes the two ways this loop runs out: nothing ever listened, or
    // something listened and would not answer. They have different causes and
    // the same symptom, so the message has to say which one happened.
    let connected = false;
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
        if (server.exited !== undefined) {
            throw new Error(`the server exited with ${server.exited} before serving`);
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
            ? `the server accepted connections but never answered one (${base}) — see the server output above`
            : `the server never opened its port (${base})`
    );
}

/** `fetch` with a deadline. See REQUEST_TIMEOUT_MS. */
function request(url) {
    return fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
}

async function expectStatus(url, expected, description) {
    const response = await request(url);
    if (response.status !== expected) {
        throw new Error(
            `${url} returned ${response.status}, expected ${expected} — ${description}`
        );
    }
    console.log(`  ok  ${expected} ${url} — ${description}`);
}

function sleep(ms) {
    return new Promise((fulfil) => setTimeout(fulfil, ms));
}

/**
 * Close the browser, kill the server and remove the scratch database on every
 * exit path. A live
 * child's pipes hold the event loop open, so the kill is waited on rather than
 * fired and forgotten, and escalated if the server ignores SIGTERM.
 */
async function cleanUp() {
    if (browser) {
        await browser.close();
    }
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
