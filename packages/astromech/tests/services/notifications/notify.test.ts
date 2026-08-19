/**
 * `notify` and `notificationsService`, pinned across the move onto notification
 * storage.
 *
 * Two things here are worth a test beyond "it still runs". The `users` lookups
 * that resolve a broadcast/per-role target moved to `users` storage, so each
 * target arm needs to be shown to reach the right people. And the fan-out insert
 * is a hand-written multi-row statement (`createStorage`'s `create` is
 * single-row), so it is the one write in this domain not covered by the wrapper.
 *
 * `dismiss` filters on `userId` as well as `id` — that pairing is the
 * authorization check, so it gets its own assertion.
 */

import type { DB } from '@/database/types';
import type { Notification } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { notificationsService, notify } from '@/notifications/service';

let db: Kysely<DB>;
let admin: string;
let editor: string;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    admin = (await createTestUser(db, { name: 'Admin', roleSlug: 'admin' })).id;
    editor = (await createTestUser(db, { name: 'Editor', roleSlug: 'editor' })).id;
});

/** First row's id, or a loud failure — keeps the assertions free of `!`. */
function firstId(rows: Notification[]): string {
    const [row] = rows;
    if (!row) throw new Error('expected at least one notification');
    return row.id;
}

describe('notify — targets', () => {
    it('delivers one row per user for an `all` target', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });

        expect(await notificationsService.count({ userId: admin })).toBe(1);
        expect(await notificationsService.count({ userId: editor })).toBe(1);
    });

    it('delivers only to holders of a role for a `role` target', async () => {
        await notify({
            target: { role: 'editor' },
            type: 'info',
            title: 'a',
            message: 'm',
        });

        expect(await notificationsService.count({ userId: admin })).toBe(0);
        expect(await notificationsService.count({ userId: editor })).toBe(1);
    });

    it('delivers to one user for a `user` target, carrying href through', async () => {
        await notify({
            target: { user: admin },
            type: 'info',
            title: 'a',
            message: 'm',
            href: '/entries/123',
        });

        const rows = await notificationsService.list({ userId: admin });
        expect(rows.length).toBe(1);
        expect(rows[0]?.href).toBe('/entries/123');
        expect(typeof rows[0]?.createdAt).toBe('string');
        expect(await notificationsService.count({ userId: editor })).toBe(0);
    });

    it('leaves href null when none is given', async () => {
        await notify({ target: { user: admin }, type: 'info', title: 'a', message: 'm' });

        expect((await notificationsService.list({ userId: admin }))[0]?.href).toBeNull();
    });
});

describe('notificationsService', () => {
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

        const rows = await notificationsService.list({ userId: admin });
        expect(rows.map((r) => r.title)).toEqual(['two', 'one']);
    });

    it('will not dismiss another user’s notification', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });
        const editorRow = firstId(await notificationsService.list({ userId: editor }));

        // The id is real but belongs to `editor`, so this must be a no-op.
        await notificationsService.dismiss({ userId: admin, id: editorRow });
        expect(await notificationsService.count({ userId: editor })).toBe(1);

        await notificationsService.dismiss({ userId: editor, id: editorRow });
        expect(await notificationsService.count({ userId: editor })).toBe(0);
    });

    it('dismisses all of one user’s notifications and no one else’s', async () => {
        await notify({ target: { all: true }, type: 'info', title: 'a', message: 'm' });
        await notify({ target: { all: true }, type: 'info', title: 'b', message: 'm' });

        await notificationsService.dismissAll({ userId: editor });
        expect(await notificationsService.count({ userId: editor })).toBe(0);
        expect(await notificationsService.count({ userId: admin })).toBe(2);
    });
});
