/**
 * Every method on `astromechClient`, against the request it makes and the shape
 * it returns.
 *
 * The client resolves its routes from the shared table rather than holding
 * URLs, so a wrong row — a path, a verb, a body key, an envelope — still
 * type-checks and still compiles. The admin is the only real consumer, and it
 * would be the thing that broke. This is the check that stands between the two:
 * one case per method, asserting the URL, the verb, the body sent, and the
 * unwrapped value returned.
 */

import type { Entry, Media, Notification, Setting, User } from '@/types/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { astromechClient as client } from '@/transport/http/client/index';

type Request = { url: string; method: string; body: unknown };

let requests: Request[] = [];

/** Answer every fetch with `payload` at `status`, recording the request. */
function stub(payload: unknown, status = 200): void {
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
        requests.push({
            url,
            method: init?.method ?? 'GET',
            body: readBody(init?.body),
        });
        return Promise.resolve(
            status === 204
                ? new Response(null, { status })
                : new Response(JSON.stringify(payload), {
                      status,
                      headers: { 'Content-Type': 'application/json' },
                  })
        );
    });
}

/** The request body as the caller wrote it — parsed back, or the FormData. */
function readBody(body: BodyInit | null | undefined): unknown {
    if (body === undefined || body === null) return undefined;
    if (typeof body === 'string') return JSON.parse(body);
    return body;
}

/** The one request the case made. */
function only(): Request {
    expect(requests).toHaveLength(1);
    return requests[0] as Request;
}

beforeEach(() => {
    requests = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const entry = { id: 'e1', type: 'post', title: 'One' } as unknown as Entry;
const entries = [entry];
const media = { id: 'm1', filename: 'a.png' } as unknown as Media;
const user = { id: 'u1', email: 'a@b.c' } as unknown as User;
const setting = { key: 'site', value: { title: 'A' } } as unknown as Setting;
const notification = { id: 'n1' } as unknown as Notification;
const page = { data: entries, total: 1, page: 1, limit: 20, pages: 1 };

type Case = {
    name: string;
    /** The response the stub answers with. `{ data: … }` unless given. */
    payload?: unknown;
    status?: number;
    call: () => Promise<unknown>;
    url: string;
    method: string;
    /** The JSON body sent; absent means no body at all. */
    body?: unknown;
    result: unknown;
};

const CASES: Case[] = [
    // entries
    {
        name: 'entries.query — one type',
        payload: page,
        call: () => client.entries.query({ type: 'post', limit: 10 }),
        url: '/cms/api/entries/post/query',
        method: 'POST',
        body: { limit: 10, full: true },
        result: page,
    },
    {
        name: 'entries.query — a list of types',
        payload: page,
        call: () => client.entries.query({ type: ['post', 'page'] }),
        url: '/cms/api/entries/query',
        method: 'POST',
        body: { type: ['post', 'page'], full: true },
        result: page,
    },
    {
        name: 'entries.query — an explicit full: false beats the client default',
        payload: page,
        call: () => client.entries.query({ type: 'post', full: false }),
        url: '/cms/api/entries/post/query',
        method: 'POST',
        body: { full: false },
        result: page,
    },
    {
        name: 'entries.get',
        call: () => client.entries.get({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1?full=true',
        method: 'GET',
        result: entry,
    },
    {
        name: 'entries.get — a missing entry reads back as null',
        payload: { data: null },
        call: () => client.entries.get({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1?full=true',
        method: 'GET',
        result: null,
    },
    {
        name: 'entries.create',
        call: () => client.entries.create({ type: 'post', data: { title: 'One' } }),
        url: '/cms/api/entries/post',
        method: 'POST',
        body: { title: 'One' },
        result: entry,
    },
    {
        name: 'entries.update — one id',
        call: () =>
            client.entries.update({ type: 'post', id: 'e1', data: { title: 'Two' } }),
        url: '/cms/api/entries/post/e1',
        method: 'PUT',
        body: { title: 'Two' },
        result: entry,
    },
    {
        name: 'entries.update — a list of ids',
        payload: { data: entries },
        call: () =>
            client.entries.update({
                type: 'post',
                id: ['e1', 'e2'],
                data: { title: 'Two' },
            }),
        url: '/cms/api/entries/post/bulk-update',
        method: 'POST',
        body: { ids: ['e1', 'e2'], data: { title: 'Two' } },
        result: entries,
    },
    {
        name: 'entries.trash — one id',
        payload: { success: true },
        call: () => client.entries.trash({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1',
        method: 'DELETE',
        result: undefined,
    },
    {
        name: 'entries.trash — one id, cascading locales',
        payload: { success: true },
        call: () =>
            client.entries.trash({ type: 'post', id: 'e1', cascadeLocales: true }),
        url: '/cms/api/entries/post/e1?cascadeLocales=true',
        method: 'DELETE',
        result: undefined,
    },
    {
        name: 'entries.trash — a list of ids',
        payload: { success: true },
        call: () => client.entries.trash({ type: 'post', id: ['e1', 'e2'] }),
        url: '/cms/api/entries/post/bulk-trash',
        method: 'POST',
        body: { ids: ['e1', 'e2'] },
        result: undefined,
    },
    {
        name: 'entries.delete — one id',
        payload: { success: true },
        call: () => client.entries.delete({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/force',
        method: 'DELETE',
        result: undefined,
    },
    {
        name: 'entries.delete — a list of ids',
        payload: { success: true },
        call: () =>
            client.entries.delete({
                type: 'post',
                id: ['e1', 'e2'],
                cascadeLocales: true,
            }),
        url: '/cms/api/entries/post/bulk-delete',
        method: 'POST',
        body: { ids: ['e1', 'e2'], cascadeLocales: true },
        result: undefined,
    },
    {
        name: 'entries.duplicate — no overrides',
        call: () => client.entries.duplicate({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/duplicate',
        method: 'POST',
        body: {},
        result: entry,
    },
    {
        name: 'entries.duplicate — with overrides',
        call: () =>
            client.entries.duplicate({
                type: 'post',
                id: 'e1',
                overrides: { title: 'Copy' },
            }),
        url: '/cms/api/entries/post/e1/duplicate',
        method: 'POST',
        body: { title: 'Copy' },
        result: entry,
    },
    {
        name: 'entries.restore — one id',
        call: () => client.entries.restore({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/restore',
        method: 'POST',
        result: entry,
    },
    {
        name: 'entries.restore — a list of ids',
        payload: { data: entries },
        call: () => client.entries.restore({ type: 'post', id: ['e1', 'e2'] }),
        url: '/cms/api/entries/post/bulk-restore',
        method: 'POST',
        body: { ids: ['e1', 'e2'] },
        result: entries,
    },
    {
        name: 'entries.emptyTrash',
        payload: { success: true },
        call: () => client.entries.emptyTrash({ type: 'post' }),
        url: '/cms/api/entries/post/trash',
        method: 'DELETE',
        result: undefined,
    },
    {
        name: 'entries.versions',
        payload: { data: [{ id: 'v1' }] },
        call: () => client.entries.versions({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/versions',
        method: 'GET',
        result: [{ id: 'v1' }],
    },
    {
        name: 'entries.restoreVersion',
        call: () =>
            client.entries.restoreVersion({ type: 'post', id: 'e1', versionId: 'v1' }),
        url: '/cms/api/entries/post/e1/versions/v1/restore',
        method: 'POST',
        result: entry,
    },
    {
        name: 'entries.incomingRelationships',
        payload: { data: [{ type: 'page', id: 'p1' }] },
        call: () => client.entries.incomingRelationships({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/incoming-relationships',
        method: 'GET',
        result: [{ type: 'page', id: 'p1' }],
    },
    {
        name: 'entries.publish — one id',
        call: () => client.entries.publish({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/publish',
        method: 'POST',
        result: entry,
    },
    {
        name: 'entries.publish — a list of ids',
        payload: { data: entries },
        call: () => client.entries.publish({ type: 'post', id: ['e1', 'e2'] }),
        url: '/cms/api/entries/post/bulk-publish',
        method: 'POST',
        body: { ids: ['e1', 'e2'] },
        result: entries,
    },
    {
        name: 'entries.unpublish — one id',
        call: () => client.entries.unpublish({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/unpublish',
        method: 'POST',
        result: entry,
    },
    {
        name: 'entries.unpublish — a list of ids',
        payload: { data: entries },
        call: () => client.entries.unpublish({ type: 'post', id: ['e1', 'e2'] }),
        url: '/cms/api/entries/post/bulk-unpublish',
        method: 'POST',
        body: { ids: ['e1', 'e2'] },
        result: entries,
    },
    {
        name: 'entries.schedule — one id',
        call: () =>
            client.entries.schedule({
                type: 'post',
                id: 'e1',
                publishedAt: new Date('2030-01-01T00:00:00.000Z'),
            }),
        url: '/cms/api/entries/post/e1/schedule',
        method: 'POST',
        body: { publishedAt: '2030-01-01T00:00:00.000Z' },
        result: entry,
    },
    {
        name: 'entries.schedule — a list of ids',
        payload: { data: entries },
        call: () =>
            client.entries.schedule({
                type: 'post',
                id: ['e1', 'e2'],
                publishedAt: new Date('2030-01-01T00:00:00.000Z'),
            }),
        url: '/cms/api/entries/post/bulk-schedule',
        method: 'POST',
        body: { ids: ['e1', 'e2'], publishedAt: '2030-01-01T00:00:00.000Z' },
        result: entries,
    },
    {
        name: 'entries.createStaged',
        call: () => client.entries.createStaged({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/staged',
        method: 'POST',
        result: entry,
    },
    {
        name: 'entries.getStaged — no staged change reads back as null',
        payload: { data: null },
        call: () => client.entries.getStaged({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/staged',
        method: 'GET',
        result: null,
    },
    {
        name: 'entries.mergeStaged',
        call: () => client.entries.mergeStaged({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/staged/merge',
        method: 'POST',
        result: entry,
    },
    {
        name: 'entries.deleteStaged',
        payload: { success: true },
        call: () => client.entries.deleteStaged({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/staged',
        method: 'DELETE',
        result: undefined,
    },
    {
        name: 'entries.issuePreviewToken',
        payload: { data: { token: 't' } },
        call: () =>
            client.entries.issuePreviewToken({
                type: 'post',
                id: 'e1',
                expiresAt: new Date('2030-01-01T00:00:00.000Z'),
            }),
        url: '/cms/api/entries/post/e1/preview-token',
        method: 'POST',
        body: { expiresAt: '2030-01-01T00:00:00.000Z' },
        result: { token: 't' },
    },
    {
        name: 'entries.revokePreviewToken',
        payload: { success: true },
        call: () => client.entries.revokePreviewToken({ type: 'post', id: 'e1' }),
        url: '/cms/api/entries/post/e1/preview-token',
        method: 'DELETE',
        result: undefined,
    },

    // media
    {
        name: 'media.query — no params',
        payload: page,
        call: () => client.media.query(),
        url: '/cms/api/media',
        method: 'GET',
        result: page,
    },
    {
        name: 'media.query — search, filter and sort',
        payload: page,
        call: () =>
            client.media.query({
                search: 'a',
                where: { mimeType: 'images' },
                page: 2,
                limit: 10,
                sort: { createdAt: 'desc' },
            }),
        url: '/cms/api/media?search=a&page=2&limit=10&sort=createdAt&dir=desc&mimeType=images',
        method: 'GET',
        result: page,
    },
    {
        name: 'media.get',
        payload: { data: media },
        call: () => client.media.get({ id: 'm1' }),
        url: '/cms/api/media/m1',
        method: 'GET',
        result: media,
    },
    {
        name: 'media.update',
        payload: { data: media },
        call: () => client.media.update({ id: 'm1', data: { alt: 'x' } }),
        url: '/cms/api/media/m1',
        method: 'PUT',
        body: { alt: 'x' },
        result: media,
    },
    {
        name: 'media.delete',
        payload: { success: true },
        call: () => client.media.delete({ id: 'm1' }),
        url: '/cms/api/media/m1',
        method: 'DELETE',
        result: undefined,
    },
    {
        name: 'media.usedBy',
        payload: { data: [{ type: 'post', id: 'e1' }] },
        call: () => client.media.usedBy({ id: 'm1' }),
        url: '/cms/api/media/m1/usage',
        method: 'GET',
        result: [{ type: 'post', id: 'e1' }],
    },

    // settings
    {
        name: 'settings.all',
        payload: { data: [setting] },
        call: () => client.settings.all(),
        url: '/cms/api/settings',
        method: 'GET',
        result: [setting],
    },
    {
        name: 'settings.get — one key',
        payload: { data: setting },
        call: () => client.settings.get({ key: 'site' }),
        url: '/cms/api/settings/site',
        method: 'GET',
        result: setting.value,
    },
    {
        name: 'settings.get — a key carrying a path and a locale suffix',
        payload: { data: setting },
        call: () => client.settings.get({ key: 'plugin:menus:/menus/main' }),
        url: '/cms/api/settings/plugin%3Amenus%3A%2Fmenus%2Fmain',
        method: 'GET',
        result: setting.value,
    },
    {
        name: 'settings.set',
        payload: { data: setting },
        call: () => client.settings.set({ key: 'site', value: { title: 'A' } }),
        url: '/cms/api/settings/site',
        method: 'PUT',
        body: { value: { title: 'A' } },
        result: setting,
    },

    // users
    {
        name: 'users.query — no params',
        payload: page,
        call: () => client.users.query(),
        url: '/cms/api/users',
        method: 'GET',
        result: page,
    },
    {
        name: 'users.query — search and sort',
        payload: page,
        call: () => client.users.query({ search: 'a', sort: { name: 'asc' } }),
        url: '/cms/api/users?search=a&sort=name&dir=asc',
        method: 'GET',
        result: page,
    },
    {
        name: 'users.get',
        payload: { data: user },
        call: () => client.users.get({ id: 'u1' }),
        url: '/cms/api/users/u1',
        method: 'GET',
        result: user,
    },
    {
        name: 'users.create',
        payload: { data: user },
        call: () =>
            client.users.create({ email: 'a@b.c', name: 'A', roleSlug: 'editor' }),
        url: '/cms/api/users',
        method: 'POST',
        body: { email: 'a@b.c', name: 'A', roleSlug: 'editor' },
        result: user,
    },
    {
        name: 'users.update',
        payload: { data: user },
        call: () => client.users.update({ id: 'u1', data: { name: 'A' } }),
        url: '/cms/api/users/u1',
        method: 'PUT',
        body: { name: 'A' },
        result: user,
    },
    {
        name: 'users.delete',
        payload: { success: true },
        call: () => client.users.delete({ id: 'u1' }),
        url: '/cms/api/users/u1',
        method: 'DELETE',
        result: undefined,
    },

    // notifications
    {
        name: 'notifications.list',
        payload: { data: [notification] },
        call: () => client.notifications.list(),
        url: '/cms/api/notifications',
        method: 'GET',
        result: [notification],
    },
    {
        name: 'notifications.count',
        payload: { data: { count: 3 } },
        call: () => client.notifications.count(),
        url: '/cms/api/notifications/count',
        method: 'GET',
        result: 3,
    },
    {
        name: 'notifications.dismiss',
        status: 204,
        call: () => client.notifications.dismiss({ id: 'n1' }),
        url: '/cms/api/notifications/n1',
        method: 'DELETE',
        result: undefined,
    },
    {
        name: 'notifications.dismissAll',
        status: 204,
        call: () => client.notifications.dismissAll(),
        url: '/cms/api/notifications',
        method: 'DELETE',
        result: undefined,
    },
];

describe('every client method builds its request from the route table', () => {
    it.each(CASES)('$name', async (testCase) => {
        stub(testCase.payload ?? { data: entry }, testCase.status);
        const result = await testCase.call();

        const request = only();
        expect(request.url).toBe(testCase.url);
        expect(request.method).toBe(testCase.method);
        expect(request.body).toEqual(testCase.body);
        expect(result).toEqual(testCase.result);
    });
});

describe('the multipart media routes', () => {
    const file = (): File => new File(['x'], 'a.png', { type: 'image/png' });

    it('posts an upload as FormData to /media/upload', async () => {
        stub({ data: media }, 201);
        const result = await client.media.upload({ file: file() });

        const request = only();
        expect(request.url).toBe('/cms/api/media/upload');
        expect(request.method).toBe('POST');
        expect(request.body).toBeInstanceOf(FormData);
        expect((request.body as FormData).get('file')).toBeInstanceOf(File);
        expect(result).toEqual(media);
    });

    it('posts a replacement as FormData to /media/:id/replace', async () => {
        stub({ data: media });
        const result = await client.media.replace({ id: 'm1', file: file() });

        const request = only();
        expect(request.url).toBe('/cms/api/media/m1/replace');
        expect(request.method).toBe('POST');
        expect(request.body).toBeInstanceOf(FormData);
        expect(result).toEqual(media);
    });
});

describe('settings.get', () => {
    it('reads a missing setting back as null rather than raising the 404', async () => {
        stub({ error: { id: 'e', code: 'NOT_FOUND', message: 'no', status: 404 } }, 404);
        await expect(client.settings.get({ key: 'absent' })).resolves.toBeNull();
    });

    it('merges the per-locale value over the base one', async () => {
        vi.stubGlobal('fetch', (url: string) => {
            requests.push({ url, method: 'GET', body: undefined });
            const value = url.endsWith('%3Afr')
                ? { title: 'Bonjour' }
                : { title: 'A', x: 1 };
            return Promise.resolve(
                new Response(JSON.stringify({ data: { key: 'site', value } }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
        });

        const value = await client.settings.get({ key: 'site', locale: 'fr' });

        expect(requests.map((request) => request.url)).toEqual([
            '/cms/api/settings/site',
            '/cms/api/settings/site%3Afr',
        ]);
        expect(value).toEqual({ title: 'Bonjour', x: 1 });
    });
});

describe('the plugin RPC namespace', () => {
    it('posts to /plugins/:name/:method with the input as the body', async () => {
        stub({ ok: true });
        const result = await client.plugins['acmeSeo']?.['analyse']?.({ id: 'e1' });

        const request = only();
        expect(request.url).toBe('/cms/api/plugins/acmeSeo/analyse');
        expect(request.method).toBe('POST');
        expect(request.body).toEqual({ id: 'e1' });
        expect(result).toEqual({ ok: true });
    });
});

describe('configure', () => {
    afterEach(() => {
        client.configure({ baseUrl: '/cms/api' });
    });

    it('moves every route onto the new base URL', async () => {
        stub({ data: entry });
        client.configure({ baseUrl: 'https://cms.example.com/api' });
        await client.entries.get({ type: 'post', id: 'e1' });

        expect(only().url).toBe('https://cms.example.com/api/entries/post/e1?full=true');
    });
});
