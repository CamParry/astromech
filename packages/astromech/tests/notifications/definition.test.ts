/**
 * The notifications service as a definition: what its catalogue declares, and
 * that `bind(ctx)` acts for the context's own user — including refusing when
 * there is none, since a session-scoped verb has no subject without one.
 */

import type { NotificationsService, User } from '@/types/index';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { notificationsDefinition, notify } from '@/notifications/service';

/** The keys `NotificationsService` declares. */
const METHODS: (keyof NotificationsService)[] = [
    'list',
    'count',
    'dismiss',
    'dismissAll',
];

/** One user's inbox: the methods bound to a context acting as them. */
function inbox(userId: string): NotificationsService {
    return notificationsDefinition.bind(
        createAppContext({ user: { id: userId } as User, role: null })
    );
}

let alice: string;
let bob: string;

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig();
    alice = (await createTestUser(db, { name: 'Alice', role: 'admin' })).id;
    bob = (await createTestUser(db, { name: 'Bob', role: 'editor' })).id;
});

describe('the catalogue', () => {
    it('holds exactly the NotificationsService methods, each stamped with its id', () => {
        expect(Object.keys(notificationsDefinition.catalogue).sort()).toEqual(
            [...METHODS].sort()
        );
        for (const [key, method] of Object.entries(notificationsDefinition.catalogue)) {
            expect(method.name, key).toBe(`notifications.${key}`);
        }
    });

    it('marks every method session-scoped and gated by no permission', () => {
        for (const key of METHODS) {
            const method = notificationsDefinition.catalogue[key];
            expect(method.sessionScoped, key).toBe(true);
            expect(method.access, key).toBe('public');
        }
    });
});

describe('bind', () => {
    it('reads only the context user’s own rows', async () => {
        await notify({ target: { user: alice }, type: 'info', title: 'a', message: 'm' });

        expect((await inbox(alice).list()).map((row) => row.title)).toEqual(['a']);
        expect(await inbox(bob).list()).toEqual([]);
    });

    it('writes only the context user’s own rows', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });

        await inbox(alice).dismissAll();

        expect(await inbox(alice).count()).toBe(0);
        expect(await inbox(bob).count()).toBe(1);
    });

    it('refuses a context with nobody signed in, naming what is missing', async () => {
        const nobody = notificationsDefinition.bind(
            createAppContext({ user: null, role: null })
        );

        await expect(nobody.list()).rejects.toThrow('session-scoped');
    });
});
