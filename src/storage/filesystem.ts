/**
 * Filesystem storage driver for local/Node.js development.
 *
 * Writes files to a local directory by key. Keys may be nested
 * (e.g. `variants/<id>/<v>/<w>.<f>`). Not suitable for Cloudflare Workers —
 * use the R2 driver in production.
 */

import { mkdir, writeFile, unlink, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { StorageDriver } from '@/types/index.js';

type FilesystemStorageOptions = {
    /** Absolute or cwd-relative path to write files, e.g. `'./public/uploads'` */
    dir: string;
    /** URL prefix for served files. Defaults to `'/uploads'` */
    urlPrefix?: string;
};

export class FilesystemStorage implements StorageDriver {
    readonly name = 'filesystem';
    private dir: string;
    private urlPrefix: string;

    constructor({ dir, urlPrefix = '/uploads' }: FilesystemStorageOptions) {
        this.dir = dir;
        this.urlPrefix = urlPrefix;
    }

    async put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: { contentType?: string }
    ): Promise<void> {
        void opts;
        const dest = join(this.dir, key);
        await mkdir(dirname(dest), { recursive: true });
        if (body instanceof Uint8Array) {
            await writeFile(dest, body);
        } else {
            await writeFile(
                dest,
                Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
            );
        }
    }

    async get(
        key: string
    ): Promise<{ body: ReadableStream; size: number; contentType?: string } | null> {
        const dest = join(this.dir, key);
        try {
            const info = await stat(dest);
            const body = Readable.toWeb(createReadStream(dest)) as ReadableStream;
            return { body, size: info.size };
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw err;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await unlink(join(this.dir, key));
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
    }

    async list(prefix: string): Promise<string[]> {
        try {
            const entries = await readdir(this.dir, {
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
                const rel = relative(this.dir, abs).split(sep).join('/');
                if (rel.startsWith(prefix)) keys.push(rel);
            }
            return keys;
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw err;
        }
    }

    getDirectUrl(key: string): string | null {
        return `${this.urlPrefix}/${key}`;
    }
}
