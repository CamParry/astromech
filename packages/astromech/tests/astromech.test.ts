/**
 * `createAstromech`: the application registry's semantics, through the real
 * create sequence rather than the harness's `setupTestConfig`.
 */

import type { DB } from '@/database/types';
import type { AstromechConfig, StorageDriver } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAstromech, getAstromech } from '@/astromech';

const storageDriver: StorageDriver = {
    name: 'noop',
    async put() {
        return undefined;
    },
    async get() {
        return null;
    },
    async stat() {
        return null;
    },
    async delete() {
        return undefined;
    },
    async list() {
        return { keys: [] };
    },
};

/** A minimal config with one entry type. */
function makeConfig(getInstance: () => Kysely<DB>): AstromechConfig {
    return {
        db: {
            type: 'test',
            getInstance,
            supportsTransactions: true,
        },
        storage: storageDriver,
        defaultLocale: 'en',
        locales: ['en'],
        entries: {
            note: {
                single: 'Note',
                plural: 'Notes',
                fields: [{ name: 'body', type: 'text', label: 'Body' }],
            },
        },
    };
}

describe('createAstromech — the application registry', () => {
    let db: Kysely<DB>;

    beforeEach(async () => {
        db = await createTestDb();
        delete globalThis.__astromech?.astromech;
    });

    it('returns the same instance for the same config object', async () => {
        const config = makeConfig(() => db);

        const first = await createAstromech({ config });
        const second = await createAstromech({ config });

        expect(second).toBe(first);
    });

    it('refuses a second create with a different config object', async () => {
        const config = makeConfig(() => db);
        await createAstromech({ config });

        expect(() => createAstromech({ config: makeConfig(() => db) })).toThrow(
            /different config/
        );
    });

    it('getAstromech reads the created instance and never creates one', async () => {
        expect(() => getAstromech()).toThrow(/no instance of Astromech exists/);

        const config = makeConfig(() => db);
        const created = await createAstromech({ config });

        expect(await getAstromech()).toBe(created);
    });

    it('clears the slot when boot fails, so the next call retries', async () => {
        const failing = makeConfig(() => {
            throw new Error('database unreachable');
        });

        await expect(createAstromech({ config: failing })).rejects.toThrow(
            /database unreachable/
        );

        const working = makeConfig(() => db);
        await expect(createAstromech({ config: working })).resolves.toBeDefined();
    });
});
