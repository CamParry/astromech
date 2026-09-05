/**
 * The users service as a definition: what its catalogue declares, and that
 * `bind(ctx)` writes the context's user as the author with no request store in
 * play.
 */

import type { Role, UsersService } from '@/types/index';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { usersDefinition } from '@/users/service';
import { userContentTable } from '@/users/tables';

const admin: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'],
    isBuiltIn: true,
};

/** The permission each method demands. */
const ACCESS: Record<keyof UsersService, string> = {
    query: 'users:read',
    get: 'users:read',
    create: 'users:create',
    update: 'users:update',
    delete: 'users:delete',
    versions: 'users:read',
    restoreVersion: 'users:update',
};

/** The authorship stamped on one user's content row — `User` does not carry it. */
async function authorship(
    userId: string
): Promise<{ createdBy: string | null; updatedBy: string | null }> {
    const row = await createRepository(userContentTable, getDb()).findOne({ userId });
    if (!row) throw new Error(`no content row for user ${userId}`);
    return { createdBy: row.createdBy, updatedBy: row.updatedBy };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

describe('the catalogue', () => {
    it('holds exactly the UsersService methods, each stamped with its id', () => {
        expect(Object.keys(usersDefinition.catalogue).sort()).toEqual(
            Object.keys(ACCESS).sort()
        );
        for (const [key, method] of Object.entries(usersDefinition.catalogue)) {
            expect(method.name, key).toBe(`users.${key}`);
        }
    });

    it('declares the permission each method demands', () => {
        for (const [key, access] of Object.entries(ACCESS)) {
            const method = usersDefinition.catalogue[key as keyof UsersService];
            expect(method.access, key).toBe(access);
        }
    });

    it('declares no binary input and no session scope', () => {
        for (const key of Object.keys(ACCESS) as (keyof UsersService)[]) {
            expect(usersDefinition.catalogue[key].binaryInput, key).toBeUndefined();
            expect(usersDefinition.catalogue[key].sessionScoped, key).toBeUndefined();
        }
    });
});

describe('bind', () => {
    it('records the context’s user as the author, with no request store in play', async () => {
        const author = await createTestUser(getDb(), { name: 'Author' });
        const ctx = createAppContext({ user: { id: author.id } as never, role: admin });

        const created = await usersDefinition
            .bind(ctx)
            .create({ data: { email: 'new@test.dev', name: 'New' } });

        expect(await authorship(created.id)).toEqual({
            createdBy: author.id,
            updatedBy: author.id,
        });
    });

    it('hands a sibling reached through ctx.users the same user', async () => {
        const author = await createTestUser(getDb(), { name: 'Author' });
        const ctx = createAppContext({ user: { id: author.id } as never, role: admin });

        // `create` lists the existing users through `ctx.users.query` to build
        // its relationship lookups, so a create exercises the sibling call.
        const created = await ctx.users.create({
            data: { email: 'sibling@test.dev', name: 'Sibling' },
        });
        const read = await ctx.users.get({ id: created.id });

        expect(read?.name).toBe('Sibling');
        expect((await authorship(created.id)).createdBy).toBe(author.id);
    });
});
