import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { s3 } from '@/storage/drivers/s3';

// fetch stub — aws4fetch signs and then calls global fetch, so every assertion
// about the wire format is an assertion about the Request it hands over.

const CREDENTIALS = {
    endpoint: 'https://accountid.r2.cloudflarestorage.com',
    bucket: 'media',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret',
};

let requests: Request[];

function stubFetch(responder: (req: Request) => Response): void {
    vi.stubGlobal(
        'fetch',
        vi.fn((input: Request) => {
            requests.push(input);
            return Promise.resolve(responder(input));
        })
    );
}

/** The single Request the driver made. */
function sent(): Request {
    const req = requests[0];
    if (req === undefined) throw new Error('expected a request');
    return req;
}

async function drain(stream: ReadableStream): Promise<Uint8Array> {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
        const result = await reader.read();
        if (result.done) {
            done = true;
        } else {
            chunks.push(result.value);
        }
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

beforeEach(() => {
    requests = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('s3()', () => {
    describe('name', () => {
        it('is "s3"', () => {
            expect(s3(CREDENTIALS).name).toBe('s3');
        });
    });

    describe('put', () => {
        it('PUTs to the path-style object URL with a signature and content type', async () => {
            stubFetch(() => new Response(null, { status: 200 }));

            await s3(CREDENTIALS).put('uploads/photo.jpg', new Uint8Array([1, 2, 3]), {
                contentType: 'image/jpeg',
            });

            const req = sent();
            expect(req.method).toBe('PUT');
            expect(req.url).toBe(
                'https://accountid.r2.cloudflarestorage.com/media/uploads/photo.jpg'
            );
            expect(req.headers.get('content-type')).toBe('image/jpeg');
            // Proves signing actually ran rather than the request going out bare.
            expect(req.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
        });

        it('throws with the status and the XML body on a non-2xx', async () => {
            stubFetch(
                () =>
                    new Response('<Error><Code>AccessDenied</Code></Error>', {
                        status: 403,
                        statusText: 'Forbidden',
                    })
            );

            await expect(
                s3(CREDENTIALS).put('uploads/photo.jpg', new Uint8Array([1]))
            ).rejects.toThrow(/403 Forbidden.*AccessDenied/s);
        });
    });

    describe('get', () => {
        it('returns the body, size, contentType and etag from a 200', async () => {
            stubFetch(
                () =>
                    new Response(new Uint8Array([1, 2, 3, 4]), {
                        status: 200,
                        headers: {
                            'content-length': '4',
                            'content-type': 'image/jpeg',
                            etag: '"abc123"',
                        },
                    })
            );

            const result = await s3(CREDENTIALS).get('uploads/photo.jpg');
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([1, 2, 3, 4]));
            expect(result.size).toBe(4);
            expect(result.totalSize).toBe(4);
            expect(result.contentType).toBe('image/jpeg');
            expect(result.etag).toBe('"abc123"');
            expect(sent().method).toBe('GET');
            expect(sent().headers.get('range')).toBeNull();
        });

        it('sends a Range header and reads totalSize off Content-Range on a 206', async () => {
            stubFetch(
                () =>
                    new Response(new Uint8Array([2, 3, 4]), {
                        status: 206,
                        headers: {
                            'content-length': '3',
                            'content-range': 'bytes 2-4/8',
                        },
                    })
            );

            const result = await s3(CREDENTIALS).get('video.mp4', {
                range: { offset: 2, length: 3 },
            });
            if (!result) throw new Error('expected a result');
            expect(sent().headers.get('range')).toBe('bytes=2-4');
            expect(result.size).toBe(3);
            expect(result.totalSize).toBe(8);
        });

        it('omits the range end when length is absent', async () => {
            stubFetch(
                () =>
                    new Response(new Uint8Array([5, 6, 7]), {
                        status: 206,
                        headers: {
                            'content-length': '3',
                            'content-range': 'bytes 5-7/8',
                        },
                    })
            );

            await s3(CREDENTIALS).get('video.mp4', { range: { offset: 5 } });
            expect(sent().headers.get('range')).toBe('bytes=5-');
        });

        it('returns null for a 404', async () => {
            stubFetch(() => new Response('', { status: 404 }));
            expect(await s3(CREDENTIALS).get('ghost.bin')).toBeNull();
        });

        it('returns null for a 403, which is what S3 gives without ListBucket', async () => {
            stubFetch(() => new Response('', { status: 403 }));
            expect(await s3(CREDENTIALS).get('ghost.bin')).toBeNull();
        });
    });

    describe('stat', () => {
        it('HEADs and maps size, contentType, etag and last-modified', async () => {
            stubFetch(
                () =>
                    new Response(null, {
                        status: 200,
                        headers: {
                            'content-length': '1024',
                            'content-type': 'image/jpeg',
                            etag: '"abc123"',
                            'last-modified': 'Tue, 28 Jul 2026 12:00:00 GMT',
                        },
                    })
            );

            const info = await s3(CREDENTIALS).stat('uploads/photo.jpg');
            expect(sent().method).toBe('HEAD');
            expect(info).toEqual({
                size: 1024,
                contentType: 'image/jpeg',
                etag: '"abc123"',
                uploadedAt: new Date('2026-07-28T12:00:00.000Z'),
            });
        });

        it('returns null for a missing key', async () => {
            stubFetch(() => new Response('', { status: 404 }));
            expect(await s3(CREDENTIALS).stat('ghost.bin')).toBeNull();
        });
    });

    describe('delete', () => {
        it('DELETEs the object', async () => {
            stubFetch(() => new Response(null, { status: 204 }));
            await s3(CREDENTIALS).delete('uploads/photo.jpg');
            expect(sent().method).toBe('DELETE');
            expect(sent().url).toBe(
                'https://accountid.r2.cloudflarestorage.com/media/uploads/photo.jpg'
            );
        });

        it('treats a 404 as success', async () => {
            stubFetch(() => new Response('', { status: 404 }));
            await expect(s3(CREDENTIALS).delete('ghost.bin')).resolves.toBeUndefined();
        });

        it('throws on any other failure', async () => {
            stubFetch(
                () => new Response('<Error/>', { status: 403, statusText: 'Forbidden' })
            );
            await expect(s3(CREDENTIALS).delete('locked.bin')).rejects.toThrow(/403/);
        });
    });

    describe('list', () => {
        const page = (body: string) => new Response(body, { status: 200 });

        it('requests list-type=2 with the prefix and limit, and parses the keys', async () => {
            stubFetch(() =>
                page(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
    <Contents><Key>variants/abc/w400.jpg</Key></Contents>
    <Contents><Key>variants/abc/w800.jpg</Key></Contents>
    <IsTruncated>false</IsTruncated>
</ListBucketResult>`)
            );

            const result = await s3(CREDENTIALS).list('variants/abc/', { limit: 25 });
            expect(result).toEqual({
                keys: ['variants/abc/w400.jpg', 'variants/abc/w800.jpg'],
            });

            const url = new URL(sent().url);
            expect(url.origin + url.pathname).toBe(
                'https://accountid.r2.cloudflarestorage.com/media'
            );
            expect(url.searchParams.get('list-type')).toBe('2');
            expect(url.searchParams.get('prefix')).toBe('variants/abc/');
            expect(url.searchParams.get('max-keys')).toBe('25');
        });

        it('XML-unescapes keys, which legitimately contain &', async () => {
            stubFetch(() =>
                page(`<ListBucketResult>
    <Contents><Key>uploads/rock &amp; roll &lt;live&gt;.jpg</Key></Contents>
    <IsTruncated>false</IsTruncated>
</ListBucketResult>`)
            );

            const result = await s3(CREDENTIALS).list('uploads/');
            expect(result.keys).toEqual(['uploads/rock & roll <live>.jpg']);
        });

        it('surfaces the continuation token as a cursor when truncated', async () => {
            stubFetch(() =>
                page(`<ListBucketResult>
    <Contents><Key>a.jpg</Key></Contents>
    <IsTruncated>true</IsTruncated>
    <NextContinuationToken>token-2</NextContinuationToken>
</ListBucketResult>`)
            );

            const result = await s3(CREDENTIALS).list('');
            expect(result).toEqual({ keys: ['a.jpg'], cursor: 'token-2' });
        });

        it('passes a cursor back as continuation-token', async () => {
            stubFetch(() =>
                page(
                    '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'
                )
            );

            const result = await s3(CREDENTIALS).list('uploads/', { cursor: 'token-2' });
            expect(result).toEqual({ keys: [] });
            expect(new URL(sent().url).searchParams.get('continuation-token')).toBe(
                'token-2'
            );
        });
    });

    describe('getPublicUrl', () => {
        it('returns publicUrl/key when configured', () => {
            const driver = s3({ ...CREDENTIALS, publicUrl: 'https://cdn.example.com' });
            expect(driver.getPublicUrl?.('uploads/photo.jpg')).toBe(
                'https://cdn.example.com/uploads/photo.jpg'
            );
        });

        it('returns null when not configured', () => {
            expect(s3(CREDENTIALS).getPublicUrl?.('uploads/photo.jpg')).toBeNull();
        });

        it('strips a trailing slash rather than emitting a double slash', () => {
            const driver = s3({ ...CREDENTIALS, publicUrl: 'https://cdn.example.com/' });
            expect(driver.getPublicUrl?.('photo.jpg')).toBe(
                'https://cdn.example.com/photo.jpg'
            );
        });
    });

    describe('signed URLs', () => {
        it('query-signs an upload URL with the expiry and content type', async () => {
            const url = await s3(CREDENTIALS).getSignedUploadUrl?.('uploads/photo.jpg', {
                expiresIn: 900,
                contentType: 'image/jpeg',
            });
            if (url === undefined) throw new Error('expected a signed URL');

            const parsed = new URL(url);
            expect(parsed.origin + parsed.pathname).toBe(
                'https://accountid.r2.cloudflarestorage.com/media/uploads/photo.jpg'
            );
            expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900');
            expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
            expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toContain(
                'content-type'
            );
            // Signing is offline — no request is made.
            expect(requests).toEqual([]);
        });

        it('query-signs a download URL', async () => {
            const url = await s3(CREDENTIALS).getSignedDownloadUrl?.(
                'uploads/photo.jpg',
                { expiresIn: 60 }
            );
            if (url === undefined) throw new Error('expected a signed URL');

            const parsed = new URL(url);
            expect(parsed.searchParams.get('X-Amz-Expires')).toBe('60');
            expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
            expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
        });
    });

    describe('missing configuration', () => {
        it('does not throw at construction — the CLI loads the config in plain Node', () => {
            expect(() =>
                s3({ endpoint: 'https://s3.example.com', bucket: 'media' })
            ).not.toThrow();
        });

        it('throws on first use, naming the option and the env var', async () => {
            const driver = s3({ endpoint: 'https://s3.example.com', bucket: 'media' });
            await expect(driver.get('any-key')).rejects.toThrow(
                /missing 'accessKeyId'.*S3_ACCESS_KEY_ID/s
            );
        });
    });
});
