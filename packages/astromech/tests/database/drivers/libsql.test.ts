/**
 * The libsql driver's local/remote classification, which the CLI reads to
 * decide whether a command needs `--allow-remote`, and the Kysely adapter
 * each kind of database gets. No test sends a query.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { libsql } from '@/database/drivers/libsql';

const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
});

describe('libsql isRemote', () => {
    it('treats an in-memory database as local', () => {
        expect(libsql({ url: ':memory:' }).isRemote()).toBe(false);
    });

    it('treats a scheme-less path as local', () => {
        expect(libsql({ url: './dev.db' }).isRemote()).toBe(false);
    });

    it('treats a `file:` url as local', () => {
        expect(libsql({ url: 'file:./dev.db' }).isRemote()).toBe(false);
    });

    it('treats a libsql or https server url as remote', () => {
        expect(libsql({ url: 'libsql://db.turso.io' }).isRemote()).toBe(true);
        expect(libsql({ url: 'https://db.turso.io' }).isRemote()).toBe(true);
    });

    it('reads DATABASE_URL when no url is passed', () => {
        process.env.DATABASE_URL = 'libsql://db.turso.io';
        expect(libsql().isRemote()).toBe(true);

        process.env.DATABASE_URL = ':memory:';
        expect(libsql().isRemote()).toBe(false);
    });
});

describe('libsql adapter', () => {
    it('runs one query at a time on a local database', () => {
        const { adapter } = libsql({ url: ':memory:' }).getInstance().getExecutor();
        expect(adapter.supportsMultipleConnections).toBe(false);
    });

    it('lets Kysely run queries side by side on a remote database', () => {
        const { adapter } = libsql({ url: 'https://db.turso.io' })
            .getInstance()
            .getExecutor();
        expect(adapter.supportsMultipleConnections).toBe(true);
    });
});
