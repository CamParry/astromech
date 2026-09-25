/**
 * The fetch client's `:type` path segment.
 *
 * A plugin entry type is addressed by its QUALIFIED id (`forms/form`).
 * That separator must be percent-encoded or the URL grows a segment and misses
 * the route entirely — which is exactly how the admin's plugin entry pages
 * would break silently. Bare ids must be untouched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntriesService } from '@/transport/http/client';

let calls: string[] = [];

beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', (url: string) => {
        calls.push(url);
        return Promise.resolve(
            new Response(JSON.stringify({ data: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('createEntriesService — type path segment', () => {
    const api = () => createEntriesService('/entries', 'full');

    it('leaves a bare type id as-is', async () => {
        await api().get({ type: 'post', id: 'abc' });
        expect(calls[0]).toBe('/cms/api/entries/post/abc?full=true');
    });

    it('percent-encodes the separator in a qualified type id', async () => {
        await api().get({ type: 'forms/form', id: 'abc' });
        expect(calls[0]).toBe('/cms/api/entries/forms%2Fform/abc?full=true');
    });

    it('encodes on the single-type query path', async () => {
        await api().query({ type: 'forms/form', limit: 'all' });
        expect(calls[0]).toBe('/cms/api/entries/forms%2Fform/query');
    });

    it('encodes on create', async () => {
        await api().create({ type: 'forms/form', data: { title: 'x' } });
        expect(calls[0]).toBe('/cms/api/entries/forms%2Fform');
    });

    it('encodes on the bulk sub-routes', async () => {
        await api().trash({ type: 'forms/form', ids: ['a', 'b'] });
        expect(calls[0]).toBe('/cms/api/entries/forms%2Fform/bulk-trash');
    });

    it('sends cross-type query types in the body, not the path', async () => {
        await api().query({ type: ['post', 'forms/form'] });
        expect(calls[0]).toBe('/cms/api/entries/query');
    });
});
