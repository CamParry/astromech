/**
 * The fetch client's media upload path.
 *
 * The router mounts the media routes at `/media` and registers the upload
 * handler at `POST /upload`, so the only URL that exists is `/media/upload`.
 * Posting to `/media` returns 404 and every admin upload path — the Upload
 * button, the library drop zone and the media field — fails silently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { astromechClient } from '@/transport/http/client/index.js';

let calls: { url: string; method: string | undefined }[] = [];

beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method });
        return Promise.resolve(
            new Response(JSON.stringify({ data: { id: 'm1' } }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            })
        );
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('media upload path', () => {
    it('posts to the registered /media/upload route, not /media', async () => {
        const file = new File(['x'], 'a.png', { type: 'image/png' });
        await astromechClient.media.upload({ file });

        expect(calls).toHaveLength(1);
        expect(calls[0]?.method).toBe('POST');
        expect(calls[0]?.url).toBe('/api/media/upload');
        expect(calls[0]?.url).not.toBe('/api/media');
    });
});
