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
// Slow (a full Astro build), so it is run on demand and in CI, never from the
// pre-commit hook.

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

let scratchDir = null;
let server = null;

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
        ASTROMECH_LOG_CONFIG_EVAL: '1',
    };

    step('migrating a scratch database');
    await run('npm', ['run', 'db:init', '-w', 'astromech-demo'], { cwd: repoRoot, env });

    step('building apps/demo');
    await run('npm', ['run', 'build'], { cwd: demoDir, env });

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
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
        if (server.exited !== undefined) {
            throw new Error(`the server exited with ${server.exited} before serving`);
        }
        try {
            await fetch(base, { redirect: 'manual' });
            return;
        } catch {
            await sleep(READY_INTERVAL_MS);
        }
    }
    throw new Error(`the server never opened its port (${base})`);
}

async function expectStatus(url, expected, description) {
    const response = await fetch(url, { redirect: 'manual' });
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
 * Kill the server and remove the scratch database on every exit path. A live
 * child's pipes hold the event loop open, so the kill is waited on rather than
 * fired and forgotten, and escalated if the server ignores SIGTERM.
 */
async function cleanUp() {
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
