/**
 * `notify` and the four inbox methods, over the notification repository.
 *
 * Two things here are worth a test beyond "it runs". The `users` lookups that
 * resolve a broadcast/per-role target go through the `users` repository, so each
 * target arm is shown to reach the right people. And the fan-out insert is a
 * hand-written multi-row statement (`createRepository`'s `create` is single-row),
 * so it is the one write in this domain not covered by the wrapper.
 *
 * `dismiss` filters on `userId` as well as `id`; that pairing is the
 * authorization check, so it gets its own assertion.
 */

import type { DB } from '@/database/types';
import type { Notification, NotificationsService, User } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import {
    getNotificationRepository,
    setNotificationRepository,
} from '@/notifications/repository';
import { notificationsDefinition, notify } from '@/notifications/service';

let db: Kysely<DB>;
let admin: string;
let editor: string;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    admin = (await createTestUser(db, { name: 'Admin', role: 'admin' })).id;
    editor = (await createTestUser(db, { name: 'Editor', role: 'editor' })).id;
});

/** One user's inbox: the methods bound to a context acting as them. */
function inbox(userId: string): NotificationsService {
    return notificationsDefinition.bind(
        createAppContext({ user: { id: userId } as User, role: null })
    );
}

/** First row's id, or a loud failure — keeps the assertions free of `!`. */
function firstId(rows: Notification[]): string {
    const [row] = rows;
    if (!row) throw new Error('expected at least one notification');
    return row.id;
}

describe('notify — targets', () => {
    it('delivers one row per user for an `all` target', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });

        expect(await inbox(admin).count()).toBe(1);
        expect(await inbox(editor).count()).toBe(1);
    });

    it('delivers only to holders of a role for a `role` target', async () => {
        await notify({
            target: { role: 'editor' },
            type: 'info',
            title: 'a',
            message: 'm',
        });

        expect(await inbox(admin).count()).toBe(0);
        expect(await inbox(editor).count()).toBe(1);
    });

    it('delivers to one user for a `user` target, carrying href through', async () => {
        await notify({
            target: { user: admin },
            type: 'info',
            title: 'a',
            message: 'm',
            href: '/entries/123',
        });

        const rows = await inbox(admin).list();
        expect(rows.length).toBe(1);
        expect(rows[0]?.href).toBe('/entries/123');
        expect(typeof rows[0]?.createdAt).toBe('string');
        expect(await inbox(editor).count()).toBe(0);
    });

    it('leaves href null when none is given', async () => {
        await notify({ target: { user: admin }, type: 'info', title: 'a', message: 'm' });

        expect((await inbox(admin).list())[0]?.href).toBeNull();
    });
});

describe('the inbox methods', () => {
    it('lists a user’s own notifications, newest first', async () => {
        await notify({
            target: { user: admin },
            type: 'info',
            title: 'one',
            message: 'm',
        });
        await notify({
            target: { user: admin },
            type: 'info',
            title: 'two',
            message: 'm',
        });

        const rows = await inbox(admin).list();
        expect(rows.map((r) => r.title)).toEqual(['two', 'one']);
    });

    it('will not dismiss another user’s notification', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });
        const editorRow = firstId(await inbox(editor).list());

        // The id is real but belongs to `editor`, so this must be a no-op.
        await inbox(admin).dismiss({ id: editorRow });
        expect(await inbox(editor).count()).toBe(1);

        await inbox(editor).dismiss({ id: editorRow });
        expect(await inbox(editor).count()).toBe(0);
    });

    it('deletes by the caller’s id as well as the row’s', async () => {
        const registered = getNotificationRepository();
        const deleted: { id: string; userId: string }[] = [];
        setNotificationRepository({
            ...registered,
            delete: (where) => {
                deleted.push(where);
                return Promise.resolve();
            },
        });
        try {
            await inbox(admin).dismiss({ id: 'row-1' });
        } finally {
            setNotificationRepository(registered);
        }

        expect(deleted).toEqual([{ id: 'row-1', userId: admin }]);
    });

    it('dismisses all of one user’s notifications and no one else’s', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });
        await notify({ target: { all: true }, type: 'info', title: 'b', message: 'm' });

        await inbox(editor).dismissAll();
        expect(await inbox(editor).count()).toBe(0);
        expect(await inbox(admin).count()).toBe(2);
    });
});
