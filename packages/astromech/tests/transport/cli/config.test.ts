/**
 * The CLI's remote-database guard.
 *
 * The property worth holding: a driver that reports itself remote stops the
 * command before `getInstance()` is ever called, so a stray `DATABASE_URL`
 * cannot open a production database by accident.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertLocalDatabase } from '@/transport/cli/config';
import type { AstromechConfig, DatabaseDriver } from '@/types/index';

/** A config carrying nothing but the driver — the guard reads only `db`. */
function configWith(db: Partial<DatabaseDriver>): AstromechConfig {
    return {
        db: {
            type: 'test',
            getInstance: () => {
                throw new Error('getInstance must not be called by the guard');
            },
            createDialect: () => {
                throw new Error('createDialect must not be called by the guard');
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
    it('refuses a remote driver, naming the type and --force', () => {
        const exit = catchExit();
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() =>
            assertLocalDatabase(
                configWith({ type: 'libsql', isRemote: () => true }),
                false
            )
        ).toThrow('exit:1');

        expect(exit).toHaveBeenCalledWith(1);
        const message = String(error.mock.calls[0]?.[0]);
        expect(message).toContain('libsql');
        expect(message).toContain('--force');
    });

    it('proceeds against a remote driver when --force was passed', () => {
        const exit = catchExit();

        expect(() =>
            assertLocalDatabase(configWith({ type: 'd1', isRemote: () => true }), true)
        ).not.toThrow();
        expect(exit).not.toHaveBeenCalled();
    });

    it('proceeds against a local driver', () => {
        const exit = catchExit();

        expect(() =>
            assertLocalDatabase(
                configWith({ type: 'libsql', isRemote: () => false }),
                false
            )
        ).not.toThrow();
        expect(exit).not.toHaveBeenCalled();
    });

    it('proceeds against a driver that reports nothing', () => {
        const exit = catchExit();

        expect(() => assertLocalDatabase(configWith({}), false)).not.toThrow();
        expect(exit).not.toHaveBeenCalled();
    });
});
