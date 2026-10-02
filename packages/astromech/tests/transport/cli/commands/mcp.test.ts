/**
 * `astromech mcp`: boots the site named by `--config` and serves its methods
 * as MCP tools over stdio.
 *
 * The server runs in a child process, from source through tsx: `runMcpServer`
 * builds its `StdioServerTransport` over `process.stdin` and `process.stdout`
 * and returns no handle to close it, so in process it would take over the test
 * worker's own stdio. A refusal that comes before the server starts runs in
 * process. The config is a real file in a temp site (`tests/_support/cli.ts`),
 * over a copy of the run's migrated test database.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createTempSite, run, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import mcp from '@/transport/cli/commands/mcp';

const require = createRequire(import.meta.url);
const packageRoot = resolve(import.meta.dirname, '../../../..');
const entryPoint = join(packageRoot, 'src/transport/cli/index.ts');

/** A child process start through tsx takes a few seconds on a loaded machine. */
const SPAWN_TIMEOUT_MS = 30_000;

type Response = { id: number; result?: Record<string, unknown>; error?: unknown };

type Waiting = { resolve: (response: Response) => void; reject: (error: Error) => void };

/** A running `astromech mcp` and a JSON-RPC client over its stdio. */
function startServer(args: string[]): {
    child: ChildProcessWithoutNullStreams;
    stderr: () => string;
    request: (id: number, method: string, params?: unknown) => Promise<Response>;
    notify: (method: string) => void;
} {
    const child = spawn(
        process.execPath,
        [require.resolve('tsx/cli'), entryPoint, 'mcp', ...args],
        { cwd: packageRoot, env: { ...process.env, NO_COLOR: '1' } }
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
    });

    const waiting = new Map<number, Waiting>();
    // Set once stdout carries a line that is not JSON-RPC; every request then fails with it.
    let protocolError: Error | undefined;
    createInterface({ input: child.stdout }).on('line', (line) => {
        let message: Response;
        try {
            message = JSON.parse(line) as Response;
        } catch {
            protocolError = new Error(`stdout carried a line that is not JSON: ${line}`);
            for (const pending of waiting.values()) pending.reject(protocolError);
            waiting.clear();
            return;
        }
        waiting.get(message.id)?.resolve(message);
        waiting.delete(message.id);
    });

    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);

    return {
        child,
        stderr: () => stderr,
        request: (id, method, params) =>
            new Promise((resolveResponse, reject) => {
                if (protocolError !== undefined) {
                    reject(protocolError);
                    return;
                }
                waiting.set(id, { resolve: resolveResponse, reject });
                child.once('exit', (code) =>
                    reject(
                        new Error(`exited ${String(code)} before answering:\n${stderr}`)
                    )
                );
                send({ jsonrpc: '2.0', id, method, params });
            }),
        notify: (method) => send({ jsonrpc: '2.0', method }),
    };
}

let configPath: string;
let running: ChildProcessWithoutNullStreams | undefined;

beforeEach(async () => {
    resetRuntime();
    const siteDir = await createTempSite();
    const database = join(siteDir, 'site.db');
    await copyFile(inject('testDbTemplate'), database);
    configPath = await writeSiteConfig(siteDir, {
        database,
        entries: {
            recipe: { single: 'Recipe', plural: 'Recipes', fields: [] },
        },
    });
});

afterEach(async () => {
    // A child killed by a signal has a `signalCode` and no `exitCode`.
    if (
        running !== undefined &&
        running.exitCode === null &&
        running.signalCode === null
    ) {
        const exited = new Promise((done) => running?.once('exit', done));
        running.kill();
        await exited;
    }
    running = undefined;
});

describe('mcp', () => {
    it(
        'answers initialize and lists only the tools the surface filter keeps',
        async () => {
            const server = startServer(['--config', configPath, '--read-only']);
            running = server.child;

            const init = await server.request(1, 'initialize', {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'test', version: '0' },
            });
            expect(init.result?.serverInfo).toMatchObject({ name: 'astromech' });

            server.notify('notifications/initialized');
            const listed = await server.request(2, 'tools/list');
            const names = (listed.result?.tools as { name: string }[]).map((t) => t.name);
            expect(names).toContain('entries_recipe_get');
            expect(names).toContain('users_query');
            expect(names).not.toContain('entries_recipe_create');
            expect(names).not.toContain('users_delete');

            expect(server.stderr()).toMatch(
                new RegExp(
                    `\\[astromech mcp\\] ready: ${names.length} tools, \\d+ skipped, [1-9]\\d* excluded by surface, confirm: off`
                )
            );
            expect(server.stderr()).toContain('[astromech mcp] database: libsql (local)');
        },
        SPAWN_TIMEOUT_MS
    );

    it('refuses an unknown --confirm mode before the server starts', async () => {
        // The command throws; the CLI's `runMain` catches what a command
        // throws, prints it and exits 1. `index.test.ts` shows that catch path
        // only for an unknown command, not for this error.
        await expect(
            run(mcp, ['--config', configPath, '--confirm', 'always'])
        ).rejects.toThrow('Unknown --confirm mode "always"');
    });
});
