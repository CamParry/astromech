/**
 * The per-domain CLI commands, run in process against the test database.
 *
 * The boot is stubbed: `createAstromech` resolves the test config and sets the
 * manifest the way the real boot does, so each command runs its own flag
 * handling, its method call and its output end to end.
 */

import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { generateMethodManifest } from '@/codegen/method-manifest';
import entriesCreate from '@/transport/cli/commands/entries-create';
import entriesDelete from '@/transport/cli/commands/entries-delete';
import entriesGet from '@/transport/cli/commands/entries-get';
import entriesList from '@/transport/cli/commands/entries-list';
import {
    publishCommand,
    unpublishCommand,
} from '@/transport/cli/commands/entries-status';
import entriesUpdate from '@/transport/cli/commands/entries-update';
import usersCreate from '@/transport/cli/commands/users-create';
import usersDelete from '@/transport/cli/commands/users-delete';
import usersGet from '@/transport/cli/commands/users-get';
import usersList from '@/transport/cli/commands/users-list';
import { ask, confirm } from '@/transport/cli/prompt';

vi.mock('@/config/load', () => ({
    loadConfigFile: vi.fn(() => Promise.resolve(makeTestConfig())),
}));

vi.mock('@/astromech', () => ({
    createAstromech: vi.fn(() => {
        const resolved = setupTestConfig(makeTestConfig());
        setMethodManifest(generateMethodManifest(resolved, []));
        return Promise.resolve({ config: resolved });
    }),
}));

vi.mock('@/transport/cli/prompt', () => ({ ask: vi.fn(), confirm: vi.fn() }));

let printed: string[];
let errors: string[];

beforeEach(async () => {
    vi.clearAllMocks();
    await createTestDb();
    setupTestConfig(makeTestConfig());
    printed = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        printed.push(String(line));
    });
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
        errors.push(String(line));
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
});

/** Run `command` with `args`, as citty would after parsing them. */
async function run(
    command: { run?: unknown },
    args: Record<string, unknown>
): Promise<void> {
    const runner = command.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { json: false, 'allow-remote': false, ...args } });
}

/** The last line printed, parsed as JSON. */
function lastJson<T>(): T {
    return JSON.parse(printed.at(-1) ?? 'null') as T;
}

describe('entries commands', () => {
    it('create, get, update, publish, unpublish and list one entry', async () => {
        await run(entriesCreate, { type: 'post', title: 'Hello', json: true });
        const { id } = lastJson<{ id: string }>();

        await run(entriesGet, { type: 'post', id });
        expect(lastJson<{ title: string }>().title).toBe('Hello');

        await run(entriesUpdate, { type: 'post', id, title: 'Renamed' });
        expect(printed.at(-1)).toBe(`Updated post ${id}`);

        await run(publishCommand, { type: 'post', id });
        expect(printed.at(-1)).toBe(`Published post ${id}`);

        await run(entriesList, { type: 'post', limit: '10' });
        expect(printed.at(-1)).toContain('Renamed');

        await run(unpublishCommand, { type: 'post', id, json: true });
        expect(lastJson<{ status: string }>().status).not.toBe('published');
        expect(errors).toEqual([]);
    });

    it('reports a missing entry as the command’s error', async () => {
        await run(entriesGet, { type: 'post', id: 'missing' });
        expect(errors.at(-1)).toBe('Error: Entry not found');
        expect(process.exitCode).toBe(1);
    });

    it('asks before deleting, and deletes on yes', async () => {
        const entry = await currentServices.entries.create({
            type: 'post',
            data: { title: 'Doomed' },
        });

        vi.mocked(confirm).mockResolvedValueOnce(false);
        await run(entriesDelete, { type: 'post', id: entry.id });
        expect(printed.at(-1)).toBe('Cancelled.');

        vi.mocked(confirm).mockResolvedValueOnce(true);
        await run(entriesDelete, { type: 'post', id: entry.id });
        expect(printed.at(-1)).toBe(`Entry ${entry.id} deleted`);
        expect(
            await currentServices.entries.get({ type: 'post', id: entry.id, full: true })
        ).toBeNull();
    });
});

describe('users commands', () => {
    it('create prompts for what the flags leave out', async () => {
        vi.mocked(ask).mockResolvedValueOnce(['secret-password-1']);
        await run(usersCreate, {
            name: 'Ada',
            email: 'ada@test.dev',
            role: 'editor',
            json: true,
        });
        expect(vi.mocked(ask)).toHaveBeenCalledWith(['Password: ']);
        const { id } = lastJson<{ id: string }>();

        await run(usersGet, { id });
        expect(lastJson<{ email: string }>().email).toBe('ada@test.dev');

        await run(usersList, {});
        expect(printed.at(-1)).toContain('ada@test.dev');

        await run(usersDelete, { id, force: true });
        expect(printed.at(-1)).toBe(`User ${id} deleted`);
        expect(vi.mocked(confirm)).not.toHaveBeenCalled();
    });

    it('reports a missing user as the command’s error, as JSON under --json', async () => {
        await run(usersGet, { id: 'missing', json: true });
        expect(JSON.parse(errors.at(-1) ?? '{}')).toEqual({ error: 'User not found' });
    });
});
