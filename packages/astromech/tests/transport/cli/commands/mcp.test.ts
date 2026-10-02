/**
 * `astromech mcp`: boots the site named by `--config` and serves its methods
 * as MCP tools over stdio.
 *
 * It runs in a child process, from source through tsx: `runMcpServer` builds
 * its `StdioServerTransport` over `process.stdin` and `process.stdout` and
 * returns no handle to close it, so in process it would take over the test
 * worker's own stdio. The config file builds its own libsql Kysely from
 * absolute paths, because a file outside the package cannot resolve
 * Astromech's modules or its dependencies by name.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';

const require = createRequire(import.meta.url);
const packageRoot = resolve(import.meta.dirname, '../../../..');
const entryPoint = join(packageRoot, 'src/transport/cli/index.ts');

/** A child process start through tsx takes a few seconds on a loaded machine. */
const SPAWN_TIMEOUT_MS = 30_000;

/** A config file over the libsql database at `dbFile`. */
function configSource(dbFile: string): string {
    const path = (id: string) => JSON.stringify(require.resolve(id));
    return `const { createClient } = require(${path('@libsql/client')});
const { LibsqlDialect } = require(${path('@libsql/kysely-libsql')});
const { CamelCasePlugin, Kysely } = require(${path('kysely')});

const db = new Kysely({
    dialect: new LibsqlDialect({ client: createClient({ url: ${JSON.stringify(`file:${dbFile}`)} }) }),
    plugins: [new CamelCasePlugin()],
});

module.exports = {
    db: { type: 'libsql', getInstance: () => db },
    entries: {
        recipe: { single: 'Recipe', plural: 'Recipes', fields: [] },
    },
};
`;
}

type Response = { id: number; result?: Record<string, unknown>; error?: unknown };

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

    const waiting = new Map<number, (response: Response) => void>();
    createInterface({ input: child.stdout }).on('line', (line) => {
        const message = JSON.parse(line) as Response;
        waiting.get(message.id)?.(message);
    });

    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);

    return {
        child,
        stderr: () => stderr,
        request: (id, method, params) =>
            new Promise((resolveResponse, reject) => {
                waiting.set(id, resolveResponse);
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

let dir: string;
let configPath: string;
let running: ChildProcessWithoutNullStreams | undefined;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'astromech-cli-mcp-'));
    const dbFile = join(dir, 'site.db');
    await copyFile(inject('testDbTemplate'), dbFile);
    configPath = join(dir, 'astromech.config.cjs');
    await writeFile(configPath, configSource(dbFile));
});

afterEach(async () => {
    if (running !== undefined && running.exitCode === null) {
        const exited = new Promise((done) => running?.once('exit', done));
        running.kill();
        await exited;
    }
    running = undefined;
    await rm(dir, { recursive: true, force: true });
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

    it(
        'refuses an unknown --confirm mode with exit code 1',
        async () => {
            const server = startServer(['--config', configPath, '--confirm', 'always']);
            running = server.child;

            const code = await new Promise((done) => server.child.once('exit', done));

            expect(code).toBe(1);
            expect(server.stderr()).toContain('Unknown --confirm mode "always"');
        },
        SPAWN_TIMEOUT_MS
    );
});
