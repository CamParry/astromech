/**
 * Helpers `check:boot` and `check:install` share: step lines, child processes,
 * a free port, and requests with a deadline.
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

/** Print the line that opens a step of a check. */
export function step(message) {
    console.log(`\n> ${message}`);
}

/** Run a command to completion, failing the check on a non-zero exit. */
export function run(command, args, options) {
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

/** Fail unless `url` answers with the `expected` status. */
export async function expectStatus(url, expected, description) {
    const response = await request(url);
    if (response.status !== expected) {
        throw new Error(
            `${url} returned ${response.status}, expected ${expected} — ${description}`
        );
    }
    console.log(`  ok  ${expected} ${url} — ${description}`);
}

/** Resolve after `ms` milliseconds. */
export function sleep(ms) {
    return new Promise((fulfil) => setTimeout(fulfil, ms));
}
