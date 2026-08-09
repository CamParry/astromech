/**
 * Filesystem storage driver for local/Node.js development.
 *
 * Writes files to a local directory by key. Keys may be nested
 * (e.g. `variants/<id>/<v>/<w>.<f>`). Not suitable for Cloudflare Workers —
 * use the R2 driver in production.
 *
 * Cannot sign URLs, so `getSignedUploadUrl`/`getSignedDownloadUrl` are absent
 * entirely; `getPublicUrl` returns a path under `urlPrefix`.
 */

import { mkdir, writeFile, unlink, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import type {
    StorageDriver,
    StorageList,
    StorageObject,
    StorageRange,
    StorageStat,
} from '@/types/index';

type FilesystemOptions = {
    /** Absolute or cwd-relative path to write files, e.g. `'./public/uploads'` */
    dir: string;
    /**
     * Public URL prefix at which `dir` is already being served — e.g.
     * `'/uploads'` when `dir` is `'./public/uploads'`. Opt-in and deliberately
     * undefaulted: nothing here can verify that `dir` is web-served at all, and
     * guessing a prefix for a directory outside `public/` would hand out URLs
     * that 404. Omit it and media is served through the media route instead.
     */
    urlPrefix?: string;
};

const DEFAULT_LIST_LIMIT = 1000;

function emptyStream(): ReadableStream {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.close();
        },
    });
}

export function filesystem(options: FilesystemOptions): StorageDriver {
    const { dir } = options;
    // Trailing slash stripped so `${urlPrefix}/${key}` can never double up.
    const urlPrefix = options.urlPrefix?.replace(/\/+$/, '');

    /**
     * Every key under `prefix`, sorted. The sort is what makes the `list`
     * cursor stable — a cursor is just "the last key of the previous page",
     * which only identifies a position if the order never changes.
     */
    async function sortedKeys(prefix: string): Promise<string[]> {
        try {
            const entries = await readdir(dir, {
                recursive: true,
                withFileTypes: true,
            });
            const keys: string[] = [];
            for (const entry of entries) {
                if (!entry.isFile()) continue;
                const abs = join(
                    entry.parentPath ?? (entry as unknown as { path: string }).path,
                    entry.name
                );
                const rel = relative(dir, abs).split(sep).join('/');
                if (rel.startsWith(prefix)) keys.push(rel);
            }
            return keys.sort();
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw err;
        }
    }

    return {
        name: 'filesystem',

        async put(
            key: string,
            body: ReadableStream | Uint8Array,
            opts?: { contentType?: string }
        ): Promise<void> {
            void opts;
            const dest = join(dir, key);
            await mkdir(dirname(dest), { recursive: true });
            if (body instanceof Uint8Array) {
                await writeFile(dest, body);
            } else {
                await writeFile(
                    dest,
                    Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
                );
            }
        },

        async get(
            key: string,
            opts?: { range?: StorageRange }
        ): Promise<StorageObject | null> {
            const dest = join(dir, key);
            try {
                const info = await stat(dest);
                const totalSize = info.size;
                const range = opts?.range;

                if (range === undefined) {
                    const body = Readable.toWeb(createReadStream(dest)) as ReadableStream;
                    return { body, size: totalSize, totalSize };
                }

                // An offset at or past the end yields an empty body, not a throw.
                const offset = Math.min(range.offset, totalSize);
                const available = totalSize - offset;
                const size = Math.max(0, Math.min(range.length ?? available, available));
                const body =
                    size === 0
                        ? emptyStream()
                        : (Readable.toWeb(
                              createReadStream(dest, {
                                  start: offset,
                                  end: offset + size - 1,
                              })
                          ) as ReadableStream);
                return { body, size, totalSize };
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
                throw err;
            }
        },

        async stat(key: string): Promise<StorageStat | null> {
            try {
                // No contentType: the filesystem does not store one.
                const info = await stat(join(dir, key));
                return { size: info.size, uploadedAt: info.mtime };
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
                throw err;
            }
        },

        async delete(key: string): Promise<void> {
            try {
                await unlink(join(dir, key));
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
            }
        },

        async list(
            prefix: string,
            opts?: { cursor?: string; limit?: number }
        ): Promise<StorageList> {
            const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
            const cursor = opts?.cursor;
            const all = await sortedKeys(prefix);
            const remaining = cursor === undefined ? all : all.filter((k) => k > cursor);
            const keys = remaining.slice(0, limit);
            const last = keys.at(-1);
            if (remaining.length > keys.length && last !== undefined) {
                return { keys, cursor: last };
            }
            return { keys };
        },

        getPublicUrl(key: string): string | null {
            return urlPrefix === undefined ? null : `${urlPrefix}/${key}`;
        },
    };
}
