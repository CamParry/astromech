/**
 * `createAstromech`: the application registry's semantics, through the real
 * create sequence rather than the harness's `setupTestConfig`.
 */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeBootConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAstromech, getAstromech } from '@/astromech';

/** A minimal config with one entry type, over the test database. */
function makeConfig(): AstromechConfig {
    return {
        ...makeBootConfig(),
        locales: ['en'],
        entries: [
            {
                type: 'note',
                single: 'Note',
                plural: 'Notes',
                fields: [{ name: 'body', type: 'text', label: 'Body' }],
            },
        ],
    };
}

describe('createAstromech — the application registry', () => {
    beforeEach(async () => {
        await createTestDb();
    });

    it('returns the same instance for the same config object', async () => {
        const config = makeConfig();

        const first = await createAstromech({ config });
        const second = await createAstromech({ config });

        expect(second).toBe(first);
    });

    it('refuses a second create with a different config object', async () => {
        const config = makeConfig();
        await createAstromech({ config });

        expect(() => createAstromech({ config: makeConfig() })).toThrow(
            /different config/
        );
    });

    it('getAstromech reads the created instance and never creates one', async () => {
        expect(() => getAstromech()).toThrow(/no instance of Astromech exists/);

        const config = makeConfig();
        const created = await createAstromech({ config });

        expect(await getAstromech()).toBe(created);
    });

    it('clears the slot when boot fails, so the next call retries', async () => {
        const failing: AstromechConfig = {
            ...makeConfig(),
            db: {
                name: 'unreachable',
                getInstance: () => {
                    throw new Error('database unreachable');
                },
            },
        };

        await expect(createAstromech({ config: failing })).rejects.toThrow(
            /database unreachable/
        );

        const working = makeConfig();
        await expect(createAstromech({ config: working })).resolves.toBeDefined();
    });
});
