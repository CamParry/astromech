/**
 * S3 storage driver for any S3-compatible endpoint — AWS S3, MinIO, Backblaze,
 * and Cloudflare R2's S3 API (`<ACCOUNT_ID>.r2.cloudflarestorage.com`).
 *
 * This is the *only* way to get signed URLs on R2: an R2 **binding** cannot
 * sign at all, so `r2({ binding })` omits `getSignedUploadUrl` entirely and a
 * deployment that needs direct client uploads must point `s3()` at R2's
 * S3-compatible endpoint with R2 API tokens.
 *
 * Signing is SigV4 over plain `fetch` via `aws4fetch` — no AWS SDK. The SDK is
 * a large, Node-flavoured dependency and this driver has to run unchanged on
 * Workers; `aws4fetch` is ~6kB and behaves identically in both runtimes.
 *
 * **Environment fallback is Node-only.** Any omitted option falls back to
 * `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
 * `S3_SECRET_ACCESS_KEY` and `S3_PUBLIC_URL` — but on Workers there is no
 * `process.env`; secrets arrive through the binding `env`, so every value must
 * be passed explicitly there. The environment is read defensively so that
 * merely constructing the driver on Workers can never throw, and missing
 * values are only reported on first use: the same config module is loaded by
 * the CLI in plain Node, where construction must always succeed.
 *
 * **Path-style addressing throughout** (`${endpoint}/${bucket}/${key}`).
 * Virtual-host style is deliberately unsupported: R2's S3 endpoint and MinIO
 * both require path-style, and AWS regional endpoints accept it — so one form
 * covers every target. Do not "fix" this.
 */

import { AwsClient } from 'aws4fetch';
import type {
    StorageDriver,
    StorageList,
    StorageObject,
    StorageRange,
    StorageStat,
} from '@/types/index';
import { AstromechError } from '@/errors/index';

export type S3Options = {
    /** Falls back to `S3_ENDPOINT` on Node. Required on Workers. */
    endpoint?: string;
    /** Falls back to `S3_BUCKET` on Node. Required on Workers. */
    bucket?: string;
    /** Defaults to `'auto'`, which is what R2 expects. */
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    /** Public base URL for `getPublicUrl`. Without it, objects are proxied. */
    publicUrl?: string;
};

type Resolved = { endpoint: string; bucket: string; client: AwsClient };

/**
 * Reads `process.env` without assuming it exists — on Workers `process` is
 * absent and touching it directly would throw at module scope.
 */
function envVar(name: string): string | undefined {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env;
    return env?.[name];
}

function required(value: string | undefined, option: string, envName: string): string {
    const resolved = value ?? envVar(envName);
    if (resolved === undefined || resolved === '') {
        throw new AstromechError(
            `s3(): missing '${option}'. Pass it to s3({ ${option}: … }) ` +
                `or set ${envName} (Node only — on Workers it must be passed explicitly).`
        );
    }
    return resolved;
}

/** S3 errors are XML, so the body is the only readable part of a failure. */
async function s3Error(op: string, target: string, res: Response): Promise<Error> {
    const body = await res.text().catch(() => '');
    return new AstromechError(
        `s3 ${op} failed for '${target}': ${res.status} ${res.statusText}` +
            (body === '' ? '' : ` — ${body}`)
    );
}

function emptyStream(): ReadableStream {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.close();
        },
    });
}

function unescapeXml(value: string): string {
    // `&amp;` must go last, or `&amp;lt;` would decode to `<`.
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

export function s3(options: S3Options): StorageDriver {
    // Safe eagerly: reading the environment cannot throw, and `getPublicUrl` is
    // synchronous so it has nowhere to resolve lazily.
    // Trailing slash stripped so `${publicUrl}/${key}` can never double up.
    const publicUrl = (options.publicUrl ?? envVar('S3_PUBLIC_URL'))?.replace(/\/+$/, '');

    // Resolution must never happen at construction — the config module is
    // imported by the CLI in plain Node, and a Workers deployment has no
    // `process.env` to fall back to. Memoised so one client is shared.
    let resolved: Resolved | undefined;
    function resolve(): Resolved {
        if (resolved !== undefined) return resolved;
        const endpoint = required(options.endpoint, 'endpoint', 'S3_ENDPOINT').replace(
            /\/+$/,
            ''
        );
        const bucket = required(options.bucket, 'bucket', 'S3_BUCKET');
        const region = options.region ?? envVar('S3_REGION') ?? 'auto';
        const accessKeyId = required(
            options.accessKeyId,
            'accessKeyId',
            'S3_ACCESS_KEY_ID'
        );
        const secretAccessKey = required(
            options.secretAccessKey,
            'secretAccessKey',
            'S3_SECRET_ACCESS_KEY'
        );
        resolved = {
            endpoint,
            bucket,
            client: new AwsClient({
                accessKeyId,
                secretAccessKey,
                region,
                service: 's3',
            }),
        };
        return resolved;
    }

    function objectUrl(key: string): string {
        const { endpoint, bucket } = resolve();
        return `${endpoint}/${bucket}/${key}`;
    }

    /** Query-signs a request for `key` and returns the URL carrying the signature. */
    async function signedUrl(
        key: string,
        method: string,
        expiresIn: number,
        contentType?: string
    ): Promise<string> {
        const { client } = resolve();
        const url = new URL(objectUrl(key));
        // Set before signing: aws4fetch defaults S3 to 86400s when absent, and
        // the parameter is part of the signed canonical query string.
        url.searchParams.set('X-Amz-Expires', String(expiresIn));
        const signed = await client.sign(url.toString(), {
            method,
            ...(contentType !== undefined
                ? { headers: { 'content-type': contentType } }
                : {}),
            aws: {
                signQuery: true,
                // `content-type` is unsignable by default, which would make the
                // option decorative; signing it binds the URL to that type.
                ...(contentType !== undefined ? { allHeaders: true } : {}),
            },
        });
        return signed.url;
    }

    return {
        name: 's3',

        async put(
            key: string,
            body: ReadableStream | Uint8Array,
            opts?: { contentType?: string }
        ): Promise<void> {
            const { client } = resolve();
            const contentType = opts?.contentType;
            const res = await client.fetch(objectUrl(key), {
                method: 'PUT',
                body: body as BodyInit,
                ...(contentType !== undefined
                    ? { headers: { 'content-type': contentType } }
                    : {}),
            });
            if (!res.ok) throw await s3Error('put', key, res);
        },

        async get(
            key: string,
            opts?: { range?: StorageRange }
        ): Promise<StorageObject | null> {
            const { client } = resolve();
            const range = opts?.range;
            const headers: Record<string, string> = {};
            if (range !== undefined) {
                const end =
                    range.length !== undefined ? range.offset + range.length - 1 : '';
                headers.range = `bytes=${range.offset}-${end}`;
            }
            const res = await client.fetch(objectUrl(key), { method: 'GET', headers });
            // 403 is what S3 returns for a missing key when the token lacks
            // ListBucket, so it is indistinguishable from "not found".
            if (res.status === 404 || res.status === 403) return null;
            if (!res.ok) throw await s3Error('get', key, res);

            const size = Number(res.headers.get('content-length') ?? '0');
            let totalSize = size;
            if (res.status === 206) {
                // `Content-Range: bytes <start>-<end>/<total>`
                const total = /\/(\d+)\s*$/.exec(
                    res.headers.get('content-range') ?? ''
                )?.[1];
                if (total !== undefined) totalSize = Number(total);
            }
            const contentType = res.headers.get('content-type');
            const etag = res.headers.get('etag');
            return {
                body: res.body ?? emptyStream(),
                size,
                totalSize,
                ...(contentType !== null ? { contentType } : {}),
                ...(etag !== null ? { etag } : {}),
            };
        },

        async stat(key: string): Promise<StorageStat | null> {
            const { client } = resolve();
            const res = await client.fetch(objectUrl(key), { method: 'HEAD' });
            if (res.status === 404 || res.status === 403) return null;
            if (!res.ok) throw await s3Error('stat', key, res);

            const contentType = res.headers.get('content-type');
            const etag = res.headers.get('etag');
            const lastModified = res.headers.get('last-modified');
            const uploadedAt = lastModified !== null ? new Date(lastModified) : undefined;
            return {
                size: Number(res.headers.get('content-length') ?? '0'),
                ...(contentType !== null ? { contentType } : {}),
                ...(etag !== null ? { etag } : {}),
                ...(uploadedAt !== undefined && !Number.isNaN(uploadedAt.getTime())
                    ? { uploadedAt }
                    : {}),
            };
        },

        async delete(key: string): Promise<void> {
            const { client } = resolve();
            const res = await client.fetch(objectUrl(key), { method: 'DELETE' });
            // Deleting a missing key is a no-op in every other driver.
            if (!res.ok && res.status !== 404) throw await s3Error('delete', key, res);
        },

        async list(
            prefix: string,
            opts?: { cursor?: string; limit?: number }
        ): Promise<StorageList> {
            const { endpoint, bucket, client } = resolve();
            const url = new URL(`${endpoint}/${bucket}`);
            url.searchParams.set('list-type', '2');
            url.searchParams.set('prefix', prefix);
            if (opts?.limit !== undefined) {
                url.searchParams.set('max-keys', String(opts.limit));
            }
            if (opts?.cursor !== undefined) {
                url.searchParams.set('continuation-token', opts.cursor);
            }
            const res = await client.fetch(url.toString(), { method: 'GET' });
            if (!res.ok) throw await s3Error('list', prefix, res);

            // ListObjectsV2 answers in XML and Workers has no DOM parser, so the
            // three fields we need are pulled out with anchored regexes rather
            // than by adding an XML parser to the Workers bundle.
            const xml = await res.text();
            const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((m) =>
                unescapeXml(m[1] ?? '')
            );
            const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
            const token =
                /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(
                    xml
                )?.[1];
            return truncated && token !== undefined
                ? { keys, cursor: unescapeXml(token) }
                : { keys };
        },

        getPublicUrl(key: string): string | null {
            return publicUrl !== undefined ? `${publicUrl}/${key}` : null;
        },

        getSignedUploadUrl(
            key: string,
            opts: { expiresIn: number; contentType?: string }
        ): Promise<string> {
            return signedUrl(key, 'PUT', opts.expiresIn, opts.contentType);
        },

        getSignedDownloadUrl(key: string, opts: { expiresIn: number }): Promise<string> {
            return signedUrl(key, 'GET', opts.expiresIn);
        },
    };
}
