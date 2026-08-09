/**
 * `initRuntime` mounts a HOST entry type's declared storage.
 *
 * Calls the real `initRuntime` rather than the harness's `setupTestConfig`,
 * which mirrors the boot sequence instead of running it — a mirror cannot fail
 * when the boot loop is deleted or moved above `registerPlugins`, which opens by
 * clearing every storage override.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@tests/harness';
import { initRuntime } from '@/boot/boot';
import { resolveConfig } from '@/boot/config-resolver';
import { setCliConfig } from '@/transport/cli/virtual-config-shim';
import { getEntryStorage } from '@/entries/storage/registry';
import { entriesService } from '@/entries/service';
import type { EntryStorage } from '@/entries/storage/types';
import type { AstromechConfig, StorageDriver } from '@/types/index';

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

describe('initRuntime — host entry storage', () => {
    beforeEach(async () => {
        const db = await createTestDb();
        const config: AstromechConfig = {
            db: {
                type: 'test',
                getInstance: () => db,
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
        const resolved = resolveConfig(config);
        setCliConfig(resolved);
        await initRuntime(config, resolved);
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
