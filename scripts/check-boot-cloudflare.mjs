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
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo-cloudflare');
const stateDir = join(demoDir, '.wrangler', 'state');

const READY_ATTEMPTS = 60;
const READY_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 10_000;

let server = null;

async function main() {
    const env = {
        ...process.env,
        // `run` spawns with stdio: 'inherit', so any prompt a child package
        // manager raises reads a stdin that may not be a terminal and hangs.
        CI: 'true',
    };

    step('building apps/demo-cloudflare');
    await run('pnpm', ['build'], { cwd: demoDir, env });

    const port = await freePort();
    step(`serving the built Worker on workerd, port ${port}`);
    server = startWorker(port, env);

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
    // table, which is the whole of the Cron Trigger path.
    await expectStatus(
        `${base}/cdn-cgi/local/scheduled`,
        200,
        'the Cron Trigger runs a tick'
    );
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
 * `wrangler dev` over the config the Astro build emitted, which names the
 * built entry and carries the bindings across from `wrangler.jsonc`. Output is
 * captured rather than inherited, and printed only if the check fails.
 */
function startWorker(port, env) {
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
        ],
        { cwd: demoDir, env }
    );
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
 * Kill wrangler on every exit path. A live child's pipes hold the event loop
 * open, so the kill is waited on rather than fired and forgotten, and
 * escalated if it ignores SIGTERM.
 */
async function cleanUp() {
    if (server && server.exited === undefined) {
        const stopped = new Promise((fulfil) => server.child.once('exit', fulfil));
        server.child.kill('SIGTERM');
        const escalate = setTimeout(() => server.child.kill('SIGKILL'), 5000);
        await stopped;
        clearTimeout(escalate);
    }
}

try {
    await main();
    console.log('\ncheck:boot:cloudflare passed');
} catch (error) {
    if (server) {
        console.error('\n--- wrangler output ---');
        console.error(server.output);
    }
    console.error(`\ncheck:boot:cloudflare failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await cleanUp();
}
