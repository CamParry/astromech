/**
 * The globals service as a definition: what its catalogue declares, and that
 * `bind(ctx)` runs a handler as the context's user with no request store in
 * play.
 */

import type { GlobalsService, Role } from '@/types/index';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { getDb } from '@/database/registry';
import { globalsDefinition } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

const admin: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'],
    isBuiltIn: true,
};

/** The capability each method needs the global to declare; absent means none. */
const REQUIRES: Record<keyof GlobalsService, string | undefined> = {
    get: undefined,
    update: undefined,
    publish: 'statuses',
    unpublish: 'statuses',
    schedule: 'statuses',
    versions: 'versioning',
    restoreVersion: 'versioning',
    createStaged: 'staging',
    getStaged: 'staging',
    mergeStaged: 'staging',
    deleteStaged: 'staging',
};

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('the catalogue', () => {
    it('holds exactly the GlobalsService methods, each stamped with its id', () => {
        expect(Object.keys(globalsDefinition.catalogue).sort()).toEqual(
            Object.keys(REQUIRES).sort()
        );
        for (const [key, method] of Object.entries(globalsDefinition.catalogue)) {
            expect(method.name, key).toBe(`globals.${key}`);
        }
    });

    it('declares the capability each method needs the global to carry', () => {
        for (const [key, requires] of Object.entries(REQUIRES)) {
            const method = globalsDefinition.catalogue[key as keyof GlobalsService];
            expect(method.requires, key).toBe(requires);
        }
    });
});

describe('bind', () => {
    it('writes the context’s user, with no request store in play', async () => {
        const author = await createTestUser(getDb());
        const ctx = createAppContext({ user: { id: author.id } as never, role: admin });

        const saved = await globalsDefinition
            .bind(ctx)
            .update({ key: 'contact', data: { fields: { email: 'hi@example.dev' } } });

        expect(saved.updatedBy).toBe(author.id);
        expect(saved.createdBy).toBe(author.id);
    });

    it('hands a sibling reached through ctx.globals the same user', async () => {
        const author = await createTestUser(getDb());
        const ctx = createAppContext({ user: { id: author.id } as never, role: admin });

        // `site` hides its `private` field from a public read, so a non-null
        // `secret` proves the sibling read ran as the same authenticated user.
        await ctx.globals.update({
            key: 'site',
            data: { fields: { title: 'Home', secret: 'shh' } },
        });
        const read = await ctx.globals.get({ key: 'site', full: true });

        expect(read?.updatedBy).toBe(author.id);
        expect(read?.fields['secret']).toBe('shh');
    });
});
