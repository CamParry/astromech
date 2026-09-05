/**
 * The media service as a definition: what its catalogue declares, and that
 * `bind(ctx)` records the context's user as the author with no request store in
 * play.
 */

import type { Role, StorageDriver } from '@/types/index';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { getDb } from '@/database/registry';
import { mediaDefinition } from '@/media/service';
import { setStorageDriver } from '@/storage/registry';

const admin: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'],
    isBuiltIn: true,
};

const noopStorage: StorageDriver = {
    name: 'noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<{ keys: string[] }> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string {
        return `/${key}`;
    },
};

/** The permission each method demands. */
const ACCESS = {
    query: 'media:read',
    get: 'media:read',
    upload: 'media:upload',
    update: 'media:update',
    delete: 'media:delete',
    replace: 'media:upload',
    usedBy: 'media:read',
    versions: 'media:read',
    restoreVersion: 'media:update',
} as const;

/** The two methods whose input carries a `File`, which JSON cannot express. */
const BINARY = ['upload', 'replace'];

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);
});

describe('the catalogue', () => {
    it('holds exactly the MediaService methods, each stamped with its id', () => {
        expect(Object.keys(mediaDefinition.catalogue).sort()).toEqual(
            Object.keys(ACCESS).sort()
        );
        for (const [key, method] of Object.entries(mediaDefinition.catalogue)) {
            expect(method.name, key).toBe(`media.${key}`);
        }
    });

    it('declares the permission each method demands', () => {
        for (const [key, access] of Object.entries(ACCESS)) {
            const method = mediaDefinition.catalogue[key as keyof typeof ACCESS];
            expect(method.access, key).toBe(access);
        }
    });

    it('flags the two methods a JSON transport cannot call, and no others', () => {
        for (const key of Object.keys(ACCESS) as (keyof typeof ACCESS)[]) {
            const expected = BINARY.includes(key) ? true : undefined;
            expect(mediaDefinition.catalogue[key].binaryInput, key).toBe(expected);
        }
    });
});

describe('bind', () => {
    it('records the context’s user as the author, with no request store in play', async () => {
        const author = await createTestUser(getDb(), { name: 'Author' });
        const ctx = createAppContext({ user: { id: author.id } as never, role: admin });

        const uploaded = await mediaDefinition
            .bind(ctx)
            .upload({ file: new File(['x'], 'a.txt', { type: 'text/plain' }) });

        expect(uploaded.createdBy).toBe(author.id);
        expect(uploaded.updatedBy).toBe(author.id);
    });

    it('hands a sibling reached through ctx.media the same user', async () => {
        const author = await createTestUser(getDb(), { name: 'Author' });
        const ctx = createAppContext({ user: { id: author.id } as never, role: admin });

        const uploaded = await ctx.media.upload({
            file: new File(['x'], 'b.txt', { type: 'text/plain' }),
        });
        await ctx.media.update({ id: uploaded.id, data: { title: 'Titled' } });
        const read = await ctx.media.get({ id: uploaded.id });

        expect(read?.title).toBe('Titled');
        expect(read?.createdBy).toBe(author.id);
    });
});
