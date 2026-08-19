/**
 * The notifications contracts, and the surfaces they open.
 *
 * Notifications is the domain that had routes and no `methods.ts`, so the point
 * here is the manifest projection and what each transport does with it: a
 * `sessionScoped` method is refused by the trusted transports (no signed-in user
 * to act as) and reachable through the scoped handle, which supplies the subject
 * itself. `decisions/0037` is the design.
 */

import type { DB } from '@/database/types';
import type { CoreManifestMethod, Role } from '@/types/index';
import type { Kysely } from 'kysely';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    runAsUser,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { resolveConfig } from '@/config/resolve';
import { notificationsContract } from '@/notifications/methods';
import { notify } from '@/notifications/service';
import { buildDispatch, buildScopedDispatch } from '@/transport/tools/dispatch';

let db: Kysely<DB>;
let alice: string;
let bob: string;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    alice = (await createTestUser(db, { name: 'Alice', roleSlug: 'admin' })).id;
    bob = (await createTestUser(db, { name: 'Bob', roleSlug: 'editor' })).id;
});

const editor: Role = {
    slug: 'editor',
    name: 'Editor',
    permissions: ['admin:access'],
    isBuiltIn: false,
};

/** Every notifications entry in a freshly generated manifest. */
function notificationMethods(): CoreManifestMethod[] {
    const manifest = generateMethodManifest(resolveConfig(makeTestConfig()));
    return manifest.methods.filter(
        (m): m is CoreManifestMethod =>
            m.source === 'core' && m.domain === 'notifications'
    );
}

/** The manifest entry for one notifications method. */
function methodNamed(name: string): CoreManifestMethod {
    const found = notificationMethods().find((m) => m.method === name);
    if (!found) throw new Error(`no manifest entry for notifications.${name}`);
    return found;
}

describe('the manifest', () => {
    it('carries one entry per contract, which it had none of before', () => {
        expect(
            notificationMethods()
                .map((m) => m.id)
                .sort()
        ).toEqual([
            'notifications.count',
            'notifications.dismiss',
            'notifications.dismissAll',
            'notifications.list',
        ]);
        expect(Object.keys(notificationsContract).length).toBe(4);
    });

    it('marks every method session-scoped and gated by no permission', () => {
        for (const method of notificationMethods()) {
            expect(method.sessionScoped).toBe(true);
            expect(method.permission).toBeNull();
            expect(method.permissionDynamic).toBeUndefined();
        }
    });

    it('keeps userId out of the input schema — it is not the caller’s to pass', () => {
        for (const method of notificationMethods()) {
            const input = method.input as { properties?: Record<string, unknown> };
            expect(input.properties?.['userId']).toBeUndefined();
        }
        expect(
            (methodNamed('dismiss').input as { properties?: Record<string, unknown> })
                .properties?.['id']
        ).toBeDefined();
    });

    it('reports the effect of each verb', () => {
        expect(methodNamed('list').mutates).toBe(false);
        expect(methodNamed('count').mutates).toBe(false);
        expect(methodNamed('dismissAll').mutates).toBe(true);
        expect(methodNamed('dismissAll').destructive).toBe(true);
        expect(methodNamed('dismiss').idempotent).toBe(true);
    });
});

describe('the trusted transports', () => {
    it('refuse every session-scoped method, naming the missing user', () => {
        for (const method of notificationMethods()) {
            const result = buildDispatch(method);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toContain('session-scoped');
        }
    });
});

describe('the scoped handle', () => {
    /** The tool a role gets for one notifications method. */
    function tool(name: string) {
        const result = buildScopedDispatch(methodNamed(name), editor);
        if (!result.ok) throw new Error(`expected a tool: ${result.reason}`);
        return result.tool;
    }

    it('acts on the caller’s own rows', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });
        await notify({ target: { user: alice }, type: 'info', title: 'b', message: 'm' });

        const rows = await runAsUser({ id: alice } as never, () =>
            tool('list').invoke({})
        );
        expect((rows as { title: string }[]).map((r) => r.title)).toEqual(['b', 'a']);
        expect(
            await runAsUser({ id: bob } as never, () => tool('count').invoke({}))
        ).toBe(1);
    });

    it('ignores a caller-supplied userId rather than trusting it', async () => {
        await notify({ target: { user: alice }, type: 'info', title: 'a', message: 'm' });

        const rows = await runAsUser({ id: bob } as never, () =>
            tool('list').invoke({ userId: alice })
        );
        expect(rows).toEqual([]);
    });

    it('dismisses only the caller’s own row', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });
        const [row] = (await runAsUser({ id: bob } as never, () =>
            tool('list').invoke({})
        )) as { id: string }[];

        await runAsUser({ id: alice } as never, () =>
            tool('dismiss').invoke({ id: row?.id ?? '' })
        );
        expect(
            await runAsUser({ id: bob } as never, () => tool('count').invoke({}))
        ).toBe(1);

        await runAsUser({ id: bob } as never, () =>
            tool('dismiss').invoke({ id: row?.id ?? '' })
        );
        expect(
            await runAsUser({ id: bob } as never, () => tool('count').invoke({}))
        ).toBe(0);
    });

    it('refuses outside a request context, where there is no user to act as', async () => {
        await expect(tool('list').invoke({})).rejects.toThrow('session-scoped');
    });
});
