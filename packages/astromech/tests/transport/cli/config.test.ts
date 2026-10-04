/**
 * How a CLI command loads the site's config.
 *
 * The property worth holding in the remote-database guard: a driver that
 * reports itself remote stops the command before `getInstance()` is ever
 * called, so a stray `DATABASE_URL` cannot open a production database by
 * accident.
 */

import type { AstromechConfig, DatabaseDriver } from '@/types/index';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supportsTransactions } from '@/database/capabilities';
import { assertLocalDatabase, loadConfig, withApplication } from '@/transport/cli/config';

/** A config carrying nothing but the driver — the guard reads only `db`. */
function configWith(db: Partial<DatabaseDriver>): AstromechConfig {
    return {
        db: {
            name: 'test',
            getInstance: () => {
                throw new Error('getInstance must not be called by the guard');
            },
            ...db,
        },
        entries: {},
    } as AstromechConfig;
}

/** Replace `process.exit` with a throw, so the guard's refusal is observable. */
function catchExit() {
    return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
    }) as never);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('assertLocalDatabase', () => {
    it('refuses a remote driver, naming the driver and --allow-remote', async () => {
        const exit = catchExit();
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(
            assertLocalDatabase(
                configWith({ name: 'libsql', isRemote: () => true }),
                false
            )
        ).rejects.toThrow('exit:1');

        expect(exit).toHaveBeenCalledWith(1);
        const message = String(error.mock.calls[0]?.[0]);
        expect(message).toContain('libsql');
        expect(message).toContain('--allow-remote');
    });

    it('refuses a driver that answers remote asynchronously, as D1 does', async () => {
        const exit = catchExit();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(
            assertLocalDatabase(
                configWith({ name: 'd1', isRemote: () => Promise.resolve(true) }),
                false
            )
        ).rejects.toThrow('exit:1');
        expect(exit).toHaveBeenCalledWith(1);
    });

    it('proceeds against a remote driver when --allow-remote was passed', async () => {
        const exit = catchExit();

        await expect(
            assertLocalDatabase(configWith({ name: 'd1', isRemote: () => true }), true)
        ).resolves.toBeUndefined();
        expect(exit).not.toHaveBeenCalled();
    });

    it('proceeds against a local driver', async () => {
        const exit = catchExit();

        await expect(
            assertLocalDatabase(
                configWith({ name: 'libsql', isRemote: () => false }),
                false
            )
        ).resolves.toBeUndefined();
        expect(exit).not.toHaveBeenCalled();
    });

    it('proceeds against a driver that reports nothing', async () => {
        const exit = catchExit();

        await expect(assertLocalDatabase(configWith({}), false)).resolves.toBeUndefined();
        expect(exit).not.toHaveBeenCalled();
    });
});

describe('withApplication', () => {
    it('reports a failure to boot as the command’s error, with exit code 1', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const body = vi.fn();

        await withApplication(
            { config: '/nowhere/astromech.config.ts', json: true },
            body
        );

        expect(body).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toHaveProperty('error');
        process.exitCode = 0;
    });
});

describe('loadConfig', () => {
    beforeEach(() => {
        resetRuntime();
    });

    it('registers the config’s database driver, so its capabilities apply', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'astromech-cli-config-'));
        const file = join(dir, 'astromech.config.mjs');
        // A D1-style driver: no interactive transactions. `loadConfig` never
        // queries the database, so the instance is an empty stand-in.
        await writeFile(
            file,
            `export default {
                db: { name: 'd1', supportsTransactions: false, getInstance: () => ({}) },
                entries: {},
            };`
        );

        try {
            await loadConfig(file);
            expect(supportsTransactions()).toBe(false);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
