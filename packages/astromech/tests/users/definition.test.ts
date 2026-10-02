/**
 * The users service as a definition, beyond what every resource's shares
 * (`tests/content/resource-definition.test.ts`): no method takes binary input or
 * a session scope, and a sibling call through `ctx.users` acts as the same user.
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
    it('declares no binary input and no session scope', () => {
        for (const key of Object.keys(
            usersDefinition.catalogue
        ) as (keyof UsersService)[]) {
            expect(usersDefinition.catalogue[key].binaryInput, key).toBeUndefined();
            expect(usersDefinition.catalogue[key].sessionScoped, key).toBeUndefined();
        }
    });
});

describe('bind', () => {
    it('hands a sibling reached through ctx.users the same user', async () => {
        const author = await createTestUser(getDb(), { name: 'Author' });
        const ctx = createAppContext({ user: author, role: admin });

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
