/**
 * R2 storage driver for Cloudflare Workers.
 *
 * The `bucket` option must be a Cloudflare R2 bucket binding, typically passed
 * from the Worker environment: `r2({ bucket: env.MY_BUCKET })`.
 *
 * R2 buckets have no public URL by default. Pass `publicUrl` (an r2.dev subdomain
 * or a custom domain bound to the bucket) to enable `getDirectUrl`. Without it,
 * `getDirectUrl` returns `null` and callers must serve objects via a Worker route.
 */

import type { StorageDriver } from '@/types/index.js';

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
    get(key: string): Promise<{
        body: ReadableStream;
        size: number;
        httpMetadata?: { contentType?: string };
    } | null>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; cursor?: string }): Promise<{
        objects: { key: string }[];
        truncated: boolean;
        cursor?: string;
    }>;
};

type R2Options = {
    bucket: R2BucketLike;
    publicUrl?: string;
};

export function r2(options: R2Options): StorageDriver {
    const { bucket, publicUrl } = options;

    return {
        name: 'r2',

        async put(
            key: string,
            body: ReadableStream | Uint8Array,
            opts?: { contentType?: string }
        ): Promise<void> {
            const value = body as ReadableStream | ArrayBuffer | ArrayBufferView;
            const contentType = opts?.contentType;
            await bucket.put(
                key,
                value,
                contentType !== undefined ? { httpMetadata: { contentType } } : undefined
            );
        },

        async get(
            key: string
        ): Promise<{ body: ReadableStream; size: number; contentType?: string } | null> {
            const obj = await bucket.get(key);
            if (!obj) return null;
            const contentType = obj.httpMetadata?.contentType;
            if (contentType !== undefined) {
                return { body: obj.body, size: obj.size, contentType };
            }
            return { body: obj.body, size: obj.size };
        },

        async delete(key: string): Promise<void> {
            await bucket.delete(key);
        },

        async list(prefix: string): Promise<string[]> {
            const keys: string[] = [];
            let cursor: string | undefined;

            do {
                const page = await bucket.list(
                    cursor !== undefined ? { prefix, cursor } : { prefix }
                );
                for (const obj of page.objects) {
                    keys.push(obj.key);
                }
                if (page.truncated) {
                    cursor = page.cursor;
                } else {
                    cursor = undefined;
                }
            } while (cursor !== undefined);

            return keys;
        },

        getDirectUrl(key: string): string | null {
            return publicUrl !== undefined ? `${publicUrl}/${key}` : null;
        },
    };
}
