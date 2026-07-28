/**
 * R2 storage driver for Cloudflare Workers.
 *
 * Normal usage names a binding: `r2({ binding: 'MEDIA' })`. The same
 * `astromech.config.ts` is loaded both by the Worker and by the CLI in plain
 * Node, and a resolved bucket object is not reachable from Node — a binding
 * NAME resolves in either runtime, so the driver resolves it lazily on first
 * use (see `@/cloudflare/bindings.js`) rather than at construction.
 *
 * `bucket` remains as an escape hatch for callers that already hold a
 * resolved R2 bucket binding: `r2({ bucket: env.MY_BUCKET })`.
 *
 * R2 buckets have no public URL by default. Pass `publicUrl` (an r2.dev subdomain
 * or a custom domain bound to the bucket) to enable `getPublicUrl`. Without it,
 * `getPublicUrl` returns `null` and callers must serve objects via a Worker route.
 *
 * R2 bindings cannot produce signed URLs at all, so `getSignedUploadUrl` and
 * `getSignedDownloadUrl` are absent here — use the S3 driver against R2's
 * S3-compatible endpoint when signing is required.
 */

import { resolveBinding } from '@/cloudflare/bindings.js';
import type {
    StorageDriver,
    StorageList,
    StorageObject,
    StorageRange,
    StorageStat,
} from '@/types/index.js';

/** Object metadata shared by `head()` and `get()`. Mirrors `R2Object`. */
type R2ObjectLike = {
    /**
     * FULL object size in bytes. R2 reports the whole object here even on a
     * ranged read, which is why it maps to `StorageObject.totalSize`.
     */
    size: number;
    httpMetadata?: { contentType?: string };
    httpEtag: string;
    uploaded: Date;
};

/**
 * Minimal structural type for a Cloudflare R2 bucket binding.
 * Avoids a hard dependency on `@cloudflare/workers-types`.
 */
export type R2BucketLike = {
    put(
        key: string,
        value: ReadableStream | ArrayBuffer | ArrayBufferView,
        options?: { httpMetadata?: { contentType?: string } }
    ): Promise<unknown>;
    head(key: string): Promise<R2ObjectLike | null>;
    get(
        key: string,
        options?: { range?: { offset: number; length?: number } }
    ): Promise<(R2ObjectLike & { body: ReadableStream }) | null>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
        objects: { key: string }[];
        truncated: boolean;
        cursor?: string;
    }>;
};

export type R2Options = { publicUrl?: string } & (
    | { binding: string; bucket?: never }
    | { bucket: R2BucketLike; binding?: never }
);

export function r2(options: R2Options): StorageDriver {
    const { publicUrl } = options;

    // Resolution must never happen at construction — a plain `bucket` is
    // already resolved, but a `binding` name is only looked up lazily, on
    // first use, and memoised so concurrent calls share one resolution.
    let pending: Promise<R2BucketLike> | undefined;
    function getBucket(): Promise<R2BucketLike> {
        if ('binding' in options) {
            // A failed lookup is dropped rather than memoised, matching the
            // resolver: a caller that supplies the environment afterwards must
            // still recover instead of being stuck with the first rejection.
            pending ??= resolveBinding<R2BucketLike>(options.binding).catch(
                (err: unknown) => {
                    pending = undefined;
                    throw err;
                }
            );
            return pending;
        }
        return Promise.resolve(options.bucket);
    }

    return {
        name: 'r2',

        async put(
            key: string,
            body: ReadableStream | Uint8Array,
            opts?: { contentType?: string }
        ): Promise<void> {
            const bucket = await getBucket();
            const value = body as ReadableStream | ArrayBuffer | ArrayBufferView;
            const contentType = opts?.contentType;
            await bucket.put(
                key,
                value,
                contentType !== undefined ? { httpMetadata: { contentType } } : undefined
            );
        },

        async get(
            key: string,
            opts?: { range?: StorageRange }
        ): Promise<StorageObject | null> {
            const bucket = await getBucket();
            const range = opts?.range;
            const obj = await bucket.get(
                key,
                range !== undefined ? { range } : undefined
            );
            if (!obj) return null;

            // `R2ObjectBody.size` stays the FULL object size on a ranged read,
            // so the slice length must be derived from the requested range.
            // Taking it straight off `obj.size` would put the wrong total into
            // every Content-Range header built from this object.
            const totalSize = obj.size;
            let size = totalSize;
            if (range !== undefined) {
                const offset = Math.min(range.offset, totalSize);
                const available = totalSize - offset;
                size = Math.max(0, Math.min(range.length ?? available, available));
            }

            const contentType = obj.httpMetadata?.contentType;
            return {
                body: obj.body,
                size,
                totalSize,
                ...(contentType !== undefined ? { contentType } : {}),
                etag: obj.httpEtag,
            };
        },

        async stat(key: string): Promise<StorageStat | null> {
            const bucket = await getBucket();
            const obj = await bucket.head(key);
            if (!obj) return null;
            const contentType = obj.httpMetadata?.contentType;
            return {
                size: obj.size,
                ...(contentType !== undefined ? { contentType } : {}),
                etag: obj.httpEtag,
                uploadedAt: obj.uploaded,
            };
        },

        async delete(key: string): Promise<void> {
            const bucket = await getBucket();
            await bucket.delete(key);
        },

        async list(
            prefix: string,
            opts?: { cursor?: string; limit?: number }
        ): Promise<StorageList> {
            const bucket = await getBucket();
            const page = await bucket.list({
                prefix,
                ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
                ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
            });
            const keys = page.objects.map((obj) => obj.key);
            return page.truncated && page.cursor !== undefined
                ? { keys, cursor: page.cursor }
                : { keys };
        },

        getPublicUrl(key: string): string | null {
            return publicUrl !== undefined ? `${publicUrl}/${key}` : null;
        },
    };
}
