/**
 * Helpers the check scripts share: step lines, child processes, the environment
 * they run in, a free port, and requests with a deadline.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

/** Requests to give a server to open its port before giving up. */
const READY_ATTEMPTS = 60;
const READY_INTERVAL_MS = 500;

// Every request is given a deadline because `fetch` has none of its own. A
// server that accepts the connection and then never answers would otherwise
// hang a check forever: the retry loop in `waitForServer` is bounded, but it
// only gets to count an attempt once the request settles. That is not
// hypothetical. The node adapter responds to an unhandled rejection during
// render by logging it and leaving the socket open, so a boot defect presents
// as a hang rather than as the failure a check exists to report.
export const REQUEST_TIMEOUT_MS = 10_000;

// A built site refuses every request while `BETTER_AUTH_SECRET` is unset. A
// check's site lives for one run and signs nothing worth protecting, so this
// value stands in when the environment sets none.
const THROWAWAY_AUTH_SECRET = 'check-secret-0123456789abcdef0123456789abcdef';

/** The `BETTER_AUTH_SECRET` a check's server runs with: the environment's, or a throwaway. */
export function betterAuthSecret() {
    return process.env.BETTER_AUTH_SECRET || THROWAWAY_AUTH_SECRET;
}

/**
 * `process.env` without `NODE_ENV`, for a check's child processes. Each tool
 * sets its own when none is inherited: vitest uses `test`, `astro build` uses
 * `production`, and a built server treats unset as production, as it is
 * deployed. An inherited value overrides all three. Under `production` the
 * admin's tests fail to load, and under `development` or `test` the built
 * server skips its production-only refusals. `name` labels the one line printed
 * when a value is dropped.
 */
export function environmentWithoutNodeEnv(name) {
    const { NODE_ENV: nodeEnv, ...environment } = process.env;
    if (nodeEnv !== undefined) {
        console.log(
            `${name}: ignoring NODE_ENV=${nodeEnv} from the shell; each tool sets its own`
        );
    }
    return environment;
}

/** Print the line that opens a step of a check. */
export function step(message) {
    console.log(`\n> ${message}`);
}

/**
 * Run a command to completion, failing the check on a non-zero exit.
 * `onSpawn`, when given, receives the child process once it is spawned.
 */
export function run(command, args, options, onSpawn) {
    return new Promise((fulfil, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', ...options });
        onSpawn?.(child);
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) fulfil();
            else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
        });
    });
}

/** A port the OS just told us is free. Raced in principle, never in practice. */
export function freePort() {
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
 * Wait until `base` answers a request with any status. `server` is the handle
 * whose `exited` field is set when the server's process exits.
 */
export async function waitForServer(base, server) {
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
export function request(url) {
    return fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
}

/** How much of an unexpected response's body a failure prints. */
const BODY_EXCERPT_LENGTH = 2000;

/**
 * Fail unless `url` answers with the `expected` status. The failure carries
 * the start of the response body, which is often the only place the cause is.
 */
export async function expectStatus(url, expected, description) {
    const response = await request(url);
    if (response.status !== expected) {
        const body = await response.text().catch((error) => `(unreadable: ${error})`);
        const excerpt = body.trim().slice(0, BODY_EXCERPT_LENGTH);
        throw new Error(
            `${url} returned ${response.status}, expected ${expected} — ${description}` +
                (excerpt ? `\nresponse body:\n${excerpt}` : '')
        );
    }
    console.log(`  ok  ${expected} ${url} — ${description}`);
}

/** Resolve after `ms` milliseconds. */
export function sleep(ms) {
    return new Promise((fulfil) => setTimeout(fulfil, ms));
}
