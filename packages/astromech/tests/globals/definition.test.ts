/**
 * The globals service as a definition, beyond what every resource's shares
 * (`tests/content/resource-definition.test.ts`): a sibling call through
 * `ctx.globals` acts as the same user.
 */

import type { Role } from '@/types/index';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { getDb } from '@/database/registry';
import { makeGlobalsConfig } from './globals-config';

const admin: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'],
    isBuiltIn: true,
};

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('bind', () => {
    it('hands a sibling reached through ctx.globals the same user', async () => {
        const author = await createTestUser(getDb());
        const ctx = createAppContext({ user: author, role: admin });

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
