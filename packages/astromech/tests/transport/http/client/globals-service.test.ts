/**
 * `client.globals` against the requests it makes.
 *
 * The handle holds no URLs: every method resolves its row from the shared table,
 * so a wrong path, verb, body key or envelope still compiles. One case per
 * method stands between that and the admin.
 */

import type { Global } from '@/types/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { astromechClient as client } from '@/transport/http/client';

type Request = { url: string; method: string; body: unknown };

let requests: Request[] = [];

/** Answer every fetch with `payload` at `status`, recording the request. */
function stub(payload: unknown, status = 200): void {
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
        requests.push({
            url,
            method: init?.method ?? 'GET',
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        return Promise.resolve(
            new Response(JSON.stringify(payload), {
                status,
                headers: { 'Content-Type': 'application/json' },
            })
        );
    });
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

const global = { key: 'site', locale: 'en', fields: { title: 'A' } } as unknown as Global;

type Case = {
    name: string;
    payload?: unknown;
    status?: number;
    call: () => Promise<unknown>;
    url: string;
    method: string;
    body?: unknown;
    result: unknown;
};

const CASES: Case[] = [
    {
        name: 'globals.get',
        call: () => client.globals.get({ key: 'site' }),
        url: '/cms/api/globals/site',
        method: 'GET',
        result: global,
    },
    {
        name: 'globals.get — one locale, in the full shape',
        call: () => client.globals.get({ key: 'site', locale: 'de', full: true }),
        url: '/cms/api/globals/site?locale=de&full=true',
        method: 'GET',
        result: global,
    },
    {
        name: 'globals.update — the data key is the whole body',
        call: () =>
            client.globals.update({ key: 'site', data: { fields: { title: 'A' } } }),
        url: '/cms/api/globals/site',
        method: 'PUT',
        body: { fields: { title: 'A' } },
        result: global,
    },
    {
        name: 'globals.update — a qualified key and a locale, both on the URL',
        call: () =>
            client.globals.update({
                key: 'seo/settings',
                locale: 'de',
                data: { fields: { titleTemplate: 'x' } },
            }),
        url: '/cms/api/globals/seo%2Fsettings?locale=de',
        method: 'PUT',
        body: { fields: { titleTemplate: 'x' } },
        result: global,
    },
    {
        name: 'globals.update — the staged change, addressed on the query string',
        call: () =>
            client.globals.update({
                key: 'site',
                staged: true,
                data: { fields: { title: 'A' } },
            }),
        url: '/cms/api/globals/site?staged=true',
        method: 'PUT',
        body: { fields: { title: 'A' } },
        result: global,
    },
    {
        name: 'globals.publish',
        call: () => client.globals.publish({ key: 'site' }),
        url: '/cms/api/globals/site/publish',
        method: 'POST',
        result: global,
    },
    {
        name: 'globals.unpublish — one locale, on the query string',
        call: () => client.globals.unpublish({ key: 'site', locale: 'de' }),
        url: '/cms/api/globals/site/unpublish?locale=de',
        method: 'POST',
        result: global,
    },
    {
        name: 'globals.schedule',
        call: () =>
            client.globals.schedule({
                key: 'site',
                publishedAt: new Date('2030-01-01T00:00:00.000Z'),
            }),
        url: '/cms/api/globals/site/schedule',
        method: 'POST',
        body: { publishedAt: '2030-01-01T00:00:00.000Z' },
        result: global,
    },
    {
        name: 'globals.versions',
        payload: { data: [{ id: 'v1' }] },
        call: () => client.globals.versions({ key: 'site' }),
        url: '/cms/api/globals/site/versions',
        method: 'GET',
        result: [{ id: 'v1' }],
    },
    {
        name: 'globals.restoreVersion',
        call: () => client.globals.restoreVersion({ key: 'site', versionId: 'v1' }),
        url: '/cms/api/globals/site/versions/v1/restore',
        method: 'POST',
        result: global,
    },
    {
        name: 'globals.createStaged',
        status: 201,
        call: () => client.globals.createStaged({ key: 'site' }),
        url: '/cms/api/globals/site/staged',
        method: 'POST',
        result: global,
    },
    {
        name: 'globals.getStaged — no staged change reads back as null',
        payload: { data: null },
        call: () => client.globals.getStaged({ key: 'site' }),
        url: '/cms/api/globals/site/staged',
        method: 'GET',
        result: null,
    },
    {
        name: 'globals.mergeStaged',
        call: () => client.globals.mergeStaged({ key: 'site' }),
        url: '/cms/api/globals/site/staged/merge',
        method: 'POST',
        result: global,
    },
    {
        name: 'globals.deleteStaged',
        payload: { success: true },
        call: () => client.globals.deleteStaged({ key: 'site' }),
        url: '/cms/api/globals/site/staged',
        method: 'DELETE',
        result: undefined,
    },
];

describe('every globals method builds its request from the route table', () => {
    it.each(CASES)('$name', async (testCase) => {
        stub(testCase.payload ?? { data: global }, testCase.status);
        const result = await testCase.call();

        const request = only();
        expect(request.url).toBe(testCase.url);
        expect(request.method).toBe(testCase.method);
        expect(request.body).toEqual(testCase.body);
        expect(result).toEqual(testCase.result);
    });
});

describe('globals.get', () => {
    it('reads a global that has never been saved back as null, not as a 404', async () => {
        stub({ error: { id: 'e', code: 'NOT_FOUND', message: 'no', status: 404 } }, 404);
        await expect(client.globals.get({ key: 'site' })).resolves.toBeNull();
    });

    it('raises every other failure', async () => {
        stub({ error: { id: 'e', code: 'FORBIDDEN', message: 'no', status: 403 } }, 403);
        await expect(client.globals.get({ key: 'site' })).rejects.toThrow();
    });
});
