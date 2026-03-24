/**
 * Filesystem storage driver for local/Node.js development.
 *
 * Writes uploaded files to a local directory and serves them at a URL prefix.
 * Not suitable for Cloudflare Workers — use the R2 driver in production.
 */

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
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

    async upload(file: File, path: string): Promise<string> {
        const dest = join(this.dir, path);
        const bytes = await file.arrayBuffer();
        await mkdir(this.dir, { recursive: true });
        await writeFile(dest, Buffer.from(bytes));
        return `${this.urlPrefix}/${path}`;
    }

    async delete(path: string): Promise<void> {
        try {
            await unlink(join(this.dir, path));
        } catch {
            // Ignore missing file
        }
    }

    getUrl(path: string): string {
        return `${this.urlPrefix}/${path}`;
    }
}
