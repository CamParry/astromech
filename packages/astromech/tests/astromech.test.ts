/**
 * `createAstromech`: the application registry's semantics, and the HOST
 * entry-type storage the create sequence mounts.
 *
 * Runs the real create sequence rather than the harness's `setupTestConfig`,
 * which mirrors the sequence instead of running it — a mirror cannot fail when
 * the host-storage loop is deleted or moved above `registerPlugins`, which opens
 * by clearing every storage override.
 */

import type { DB } from '@/database/types';
import type { EntryStorage } from '@/entries/storage/types';
import type { AstromechConfig, StorageDriver } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAstromech, getAstromech } from '@/astromech';
import { entriesService } from '@/entries/service';
import { getEntryStorage } from '@/entries/storage/registry';

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

/**
 * Declares no capabilities and throws from every method, so any read reaching it
 * is unmistakable in the failure message.
 */
function throwing(): never {
    throw new Error('custom widget storage reached');
}

const throwingStorage: EntryStorage = {
    supports: [],
    list: throwing,
    get: throwing,
    create: throwing,
    update: throwing,
    delete: throwing,
    uniqueSlug: throwing,
};

/** A config whose `widget` type declares its own storage. */
function makeConfig(getInstance: () => Kysely<DB>): AstromechConfig {
    return {
        db: {
            type: 'test',
            getInstance,
            createDialect() {
                throw new Error('unused');
            },
            supportsTransactions: true,
        },
        storage: storageDriver,
        defaultLocale: 'en',
        locales: ['en'],
        entries: {
            widget: {
                single: 'Widget',
                plural: 'Widgets',
                storage: throwingStorage,
            },
            note: {
                single: 'Note',
                plural: 'Notes',
                fields: [{ name: 'body', type: 'text', label: 'Body' }],
            },
        },
    };
}

describe('createAstromech — host entry storage', () => {
    beforeEach(async () => {
        const db = await createTestDb();
        const config = makeConfig(() => db);
        // One application per process, and each case builds its own config.
        delete globalThis.__astromech?.astromech;
        await createAstromech({ config });
    });

    it('registers the declared storage under the bare type name', () => {
        expect(getEntryStorage('widget')).toBe(throwingStorage);
    });

    it('leaves a type without declared storage on built-in storage', () => {
        expect(getEntryStorage('note')).not.toBe(throwingStorage);
    });

    it('routes a read for the type through its declared storage', async () => {
        await expect(entriesService.query({ type: 'widget' })).rejects.toThrow(
            /custom widget storage reached/
        );
    });

    it('routes a read for the control type through built-in storage', async () => {
        await expect(entriesService.query({ type: 'note' })).resolves.toBeDefined();
    });
});

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
