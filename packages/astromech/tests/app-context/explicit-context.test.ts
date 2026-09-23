/**
 * A call made on an explicit `AppContext` stays that context all the way down:
 * the hooks it fires and the plugin methods it reaches act as its user, with no
 * request scope open.
 */

import type { PluginContext, PluginDefinition, User } from '@/types/index';
import { adminRole } from '@tests/fixtures';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAppContext } from '@/app-context/app-context';
import { defineHook } from '@/plugins/define-hook';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { createPluginContext } from '@/plugins/runtime/plugin-runtime';

const seenByHook: (string | null)[] = [];

const probe: PluginDefinition = {
    package: 'probe',
    hooks: [
        defineHook('entry:beforeCreate', (_payload, ctx: PluginContext) => {
            seenByHook.push(ctx.user?.id ?? null);
        }),
    ],
    service: {
        whoami: {
            access: 'public',
            input: z.object({}),
            mutates: false,
            handler: (_input: unknown, ctx: PluginContext) => ctx.user?.id ?? null,
        },
    },
};

let user: User;

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig({ ...makeTestConfig(), plugins: [probe] });
    seenByHook.length = 0;
    user = (await createTestUser(db, { role: 'admin' })) as unknown as User;
});

describe('an explicit AppContext', () => {
    it('fires its hooks as its own user', async () => {
        const ctx = createAppContext({ user, role: adminRole });

        await ctx.entries.create({ type: 'post', data: { title: 'A' } });

        expect(seenByHook).toEqual([user.id]);
    });

    it('reaches plugin methods as its own user', async () => {
        const app = createAppContext({ user, role: adminRole });
        const ctx = createPluginContext(resolvePluginIdentity(probe), app);

        await expect(ctx.plugins?.['probe']?.['whoami']?.({})).resolves.toBe(user.id);
    });
});
