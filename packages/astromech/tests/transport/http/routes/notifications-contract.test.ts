/**
 * All four `routes/notifications.ts` handlers over the real router.
 *
 * The domain is session-scoped, so the thing worth pinning is that every
 * handler filters on the injected `c.var.user.id` and never on anything the
 * caller sent — plus the two response shapes that are not the plain `{ data }`
 * envelope: `count`'s `{ data: { count } }` and the 204s.
 */

import type { Notification, NotificationsService, User } from '@/types/index';
import { roleWith } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { notificationsDefinition, notify } from '@/notifications/service';
import { notificationsRouter } from '@/transport/http/routes/notifications';

const usersService = currentServices.users;

/** No permission holds any authority here — the session is the whole of it. */
const noPermissions = roleWith([]);

function app(user: User) {
    return mountRouter('/notifications', notificationsRouter, noPermissions, user);
}

/** One user's inbox, read directly: the methods bound to a context acting as them. */
function inbox(user: User): NotificationsService {
    return notificationsDefinition.bind(createAppContext({ user, role: null }));
}

let owner: User;
let stranger: User;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    owner = await usersService.create({
        data: { email: 'owner@test.dev', name: 'Owner' },
    });
    stranger = await usersService.create({
        data: {
            email: 'stranger@test.dev',
            name: 'Stranger',
        },
    });
    await notify({
        target: { user: owner.id },
        type: 'info',
        title: 'Hello',
        message: 'A message',
        href: '/somewhere',
    });
});

describe('GET /notifications', () => {
    it('returns the caller’s own notifications in a { data } envelope', async () => {
        const res = await app(owner).request('/notifications');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Notification[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data).toHaveLength(1);
        expect(Object.keys(body.data[0] ?? {}).sort()).toEqual([
            'createdAt',
            'href',
            'id',
            'message',
            'title',
            'type',
            'userId',
        ]);
        expect(body.data[0]?.title).toBe('Hello');
        expect(body.data[0]?.userId).toBe(owner.id);
    });

    it('returns nothing for a user with no notifications', async () => {
        const res = await app(stranger).request('/notifications');
        expect(((await res.json()) as { data: Notification[] }).data).toEqual([]);
    });
});

describe('GET /notifications/count', () => {
    it('wraps the scalar as { data: { count } }', async () => {
        const res = await app(owner).request('/notifications/count');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { count: 1 } });
    });

    it('counts only the caller’s rows', async () => {
        const res = await app(stranger).request('/notifications/count');
        expect(await res.json()).toEqual({ data: { count: 0 } });
    });
});

describe('DELETE /notifications/:id', () => {
    it('dismisses one and answers 204 with an empty body', async () => {
        const [notification] = await inbox(owner).list();
        const res = await app(owner).request(`/notifications/${notification?.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(204);
        expect(await res.text()).toBe('');
        expect(await inbox(owner).count()).toBe(0);
    });

    it('is a no-op 204 when the id belongs to somebody else', async () => {
        const [notification] = await inbox(owner).list();
        const res = await app(stranger).request(`/notifications/${notification?.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(204);
        expect(await inbox(owner).count()).toBe(1);
    });
});

describe('DELETE /notifications', () => {
    it('dismisses every one of the caller’s and answers 204', async () => {
        await notify({
            target: { user: owner.id },
            type: 'info',
            title: 'Second',
            message: 'Another',
        });
        const res = await app(owner).request('/notifications', { method: 'DELETE' });
        expect(res.status).toBe(204);
        expect(await res.text()).toBe('');
        expect(await inbox(owner).count()).toBe(0);
    });

    it('leaves other users’ rows alone', async () => {
        const res = await app(stranger).request('/notifications', { method: 'DELETE' });
        expect(res.status).toBe(204);
        expect(await inbox(owner).count()).toBe(1);
    });
});
