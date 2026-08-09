/**
 * Storage-level tests for tableStorage plus entries-service integration.
 *
 * Uses a scratch table created via raw DDL — no migration dependency. The
 * scratch table's columns mirror the table below: id (ULID text), from,
 * to, status, enabled (boolean integer), created_at/updated_at (ISO-8601 text).
 * The DDL uses snake_case identifiers because the shared handle runs
 * `CamelCasePlugin`, which snake_cases every identifier it emits; selects still
 * come back camelCased, so the table's keys line up.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { Astromech } from '@/transport/local/index';
import type { AstromechConfig, PluginDefinition } from '@/types/index';
import { tableStorage } from '@/entries/storage/table';
import { defineTable } from '@/database/define-table';

// ============================================================================
// Scratch table definition
// ============================================================================

/** Crockford base32, the ULID alphabet — ids are 26 uppercase chars. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const testLinksTable = defineTable('test_links', ({ col }) => ({
    id: col.id(),
    from: col.text({ notNull: true }),
    to: col.text({ notNull: true }),
    status: col.text({ notNull: true, default: '301' }),
    /** Nullable on purpose — the `IS NULL` where-semantics need a null column. */
    note: col.text(),
    enabled: col.boolean({ notNull: true, default: true }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

const storage = tableStorage(testLinksTable);

// ============================================================================
// Test setup
// ============================================================================

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig();

    await sql`CREATE TABLE test_links (
            id text PRIMARY KEY,
            "from" text NOT NULL,
            "to" text NOT NULL,
            status text NOT NULL DEFAULT '301',
            note text,
            enabled integer NOT NULL DEFAULT 1,
            created_at text NOT NULL,
            updated_at text NOT NULL
        )`.execute(db);
});

// ============================================================================
// supports
// ============================================================================

describe('supports', () => {
    it('declares no capabilities (empty frozen array)', () => {
        expect(storage.supports).toEqual([]);
        expect(Object.isFrozen(storage.supports)).toBe(true);
    });
});

// ============================================================================
// create
// ============================================================================

describe('create', () => {
    it('generates an id, sets timestamps, writes field columns', async () => {
        // Timestamps are ISO-8601 TEXT, so millisecond precision round-trips.
        const before = new Date();
        const record = await storage.create({
            type: 'link',
            fields: { from: '/old', to: '/new', status: '302', enabled: true },
        });

        expect(record.id).toMatch(ULID);
        expect(record.createdAt).toBeInstanceOf(Date);
        expect(record.updatedAt).toBeInstanceOf(Date);
        expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(record.fields['from']).toBe('/old');
        expect(record.fields['to']).toBe('/new');
        expect(record.fields['status']).toBe('302');
        expect(record.fields['enabled']).toBe(true);
    });

    it('drops unknown field keys silently', async () => {
        const record = await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/b', unknownCol: 'ignored' },
        });
        expect(record.fields['unknownCol']).toBeUndefined();
        expect(record.fields['from']).toBe('/a');
    });

    it('round-trips boolean field (enabled)', async () => {
        const record = await storage.create({
            type: 'link',
            fields: { from: '/x', to: '/y', enabled: false },
        });
        expect(record.fields['enabled']).toBe(false);
    });

    it('ignores title/slug/status/locale keys from EntryWrite', async () => {
        // These are EntryWrite keys that tableStorage ignores
        const record = await storage.create({
            type: 'link',
            title: 'This is ignored',
            slug: 'ignored',
            locale: 'en',
            fields: { from: '/a', to: '/b' },
        });
        // No type field on tableStorage records
        expect(record.type).toBeUndefined();
        // Fields should not contain title/slug/locale
        expect(record.fields['title']).toBeUndefined();
    });
});

// ============================================================================
// get
// ============================================================================

describe('get', () => {
    it('returns null for missing id', async () => {
        const result = await storage.get('no-such-id');
        expect(result).toBeNull();
    });

    it('returns the record for a valid id', async () => {
        const created = await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/b' },
        });
        const got = await storage.get(created.id);
        expect(got?.id).toBe(created.id);
        expect(got?.fields['from']).toBe('/a');
    });
});

// ============================================================================
// update
// ============================================================================

describe('update', () => {
    it('merges fields and bumps updatedAt; createdAt unchanged', async () => {
        const created = await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/b', status: '301' },
        });

        // ISO-8601 TEXT keeps milliseconds, so a few ms is enough for updatedAt
        // to move.
        await new Promise((r) => setTimeout(r, 5));

        const updated = await storage.update(created.id, {
            fields: { from: '/a', to: '/new', status: '302' },
        });

        expect(updated.fields['to']).toBe('/new');
        expect(updated.fields['status']).toBe('302');
        expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
        // createdAt must be unchanged
        expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
    });

    it('throws when row is missing', async () => {
        await expect(
            storage.update('nonexistent', { fields: { from: '/x', to: '/y' } })
        ).rejects.toThrow();
    });
});

// ============================================================================
// delete
// ============================================================================

describe('delete', () => {
    it('hard-deletes the row', async () => {
        const created = await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/b' },
        });
        await storage.delete(created.id);
        const gone = await storage.get(created.id);
        expect(gone).toBeNull();
    });
});

// ============================================================================
// list — pagination
// ============================================================================

describe('list – pagination', () => {
    async function seed(n: number) {
        for (let i = 0; i < n; i++) {
            await storage.create({
                type: 'link',
                fields: { from: `/from${i}`, to: `/to${i}` },
            });
        }
    }

    it('returns total and paginated data', async () => {
        await seed(5);
        const res = await storage.list({ type: 'link', limit: 2, page: 1 });
        expect(res.data).toHaveLength(2);
        expect(res.total).toBe(5);
    });

    it('page 2 returns correct slice', async () => {
        await seed(5);
        const res = await storage.list({ type: 'link', limit: 2, page: 2 });
        expect(res.data).toHaveLength(2);
        expect(res.total).toBe(5);
    });

    it('limit: "all" returns all rows with total === data.length', async () => {
        await seed(7);
        const res = await storage.list({ type: 'link', limit: 'all' });
        expect(res.data).toHaveLength(7);
        expect(res.total).toBe(7);
    });
});

// ============================================================================
// list — sort
// ============================================================================

describe('list – sort', () => {
    it('sorts asc/desc on a field column', async () => {
        await storage.create({ type: 'link', fields: { from: '/b', to: '/x' } });
        await storage.create({ type: 'link', fields: { from: '/a', to: '/y' } });
        await storage.create({ type: 'link', fields: { from: '/c', to: '/z' } });

        const asc = await storage.list({
            type: 'link',
            limit: 'all',
            sort: { from: 'asc' },
        });
        expect(asc.data.map((r) => r.fields['from'])).toEqual(['/a', '/b', '/c']);

        const desc = await storage.list({
            type: 'link',
            limit: 'all',
            sort: { from: 'desc' },
        });
        expect(desc.data.map((r) => r.fields['from'])).toEqual(['/c', '/b', '/a']);
    });

    it('sorts on createdAt', async () => {
        const a = await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/x' },
        });
        await new Promise((r) => setTimeout(r, 5));
        const b = await storage.create({
            type: 'link',
            fields: { from: '/b', to: '/y' },
        });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            sort: { createdAt: 'asc' },
        });
        expect(res.data[0]?.id).toBe(a.id);
        expect(res.data[1]?.id).toBe(b.id);
    });
});

// ============================================================================
// list — where filters
// ============================================================================

describe('list – where filters', () => {
    it('eq filter', async () => {
        await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/x', status: '301' },
        });
        await storage.create({
            type: 'link',
            fields: { from: '/b', to: '/y', status: '302' },
        });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            where: { status: '302' },
        });
        expect(res.data).toHaveLength(1);
        expect(res.data[0]?.fields['status']).toBe('302');
    });

    it('in filter', async () => {
        await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/x', status: '301' },
        });
        await storage.create({
            type: 'link',
            fields: { from: '/b', to: '/y', status: '302' },
        });
        await storage.create({
            type: 'link',
            fields: { from: '/c', to: '/z', status: '307' },
        });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            where: { status: { in: ['301', '307'] } },
        });
        expect(res.data).toHaveLength(2);
        const statuses = res.data.map((r) => r.fields['status']).sort();
        expect(statuses).toEqual(['301', '307']);
    });

    it('like filter', async () => {
        await storage.create({ type: 'link', fields: { from: '/admin/page', to: '/x' } });
        await storage.create({ type: 'link', fields: { from: '/home', to: '/y' } });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            where: { from: { like: '/admin%' } },
        });
        expect(res.data).toHaveLength(1);
        expect(res.data[0]?.fields['from']).toBe('/admin/page');
    });

    it('bare null filters to IS NULL rather than meaning "unfiltered"', async () => {
        await storage.create({
            type: 'link',
            fields: { from: '/a', to: '/x', note: 'kept' },
        });
        await storage.create({ type: 'link', fields: { from: '/b', to: '/y' } });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            where: { note: null },
        });
        expect(res.data).toHaveLength(1);
        expect(res.data[0]?.fields['from']).toBe('/b');
    });

    it('ignores a `locale` where key instead of throwing (no locale concept)', async () => {
        await storage.create({ type: 'link', fields: { from: '/a', to: '/x' } });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            where: { locale: 'en' },
        });
        expect(res.data).toHaveLength(1);
    });
});

// ============================================================================
// list — search + searchFields
// ============================================================================

describe('list – search and searchFields', () => {
    it('matches either column when searching two searchFields', async () => {
        await storage.create({ type: 'link', fields: { from: '/hello', to: '/world' } });
        await storage.create({ type: 'link', fields: { from: '/foo', to: '/bar' } });
        await storage.create({
            type: 'link',
            fields: { from: '/baz', to: '/hello-page' },
        });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            search: 'hello',
            searchFields: ['from', 'to'],
        });
        expect(res.data).toHaveLength(2);
        const froms = res.data.map((r) => r.fields['from']).sort();
        expect(froms).toEqual(['/baz', '/hello']);
    });

    it('search with no searchFields is a no-op (returns all)', async () => {
        await storage.create({ type: 'link', fields: { from: '/a', to: '/b' } });
        await storage.create({ type: 'link', fields: { from: '/c', to: '/d' } });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            search: 'zzz',
            // no searchFields
        });
        expect(res.data).toHaveLength(2);
    });

    it('combines search with a where filter on the id column', async () => {
        const a = await storage.create({
            type: 'link',
            fields: { from: '/hello', to: '/x' },
        });
        await storage.create({
            type: 'link',
            fields: { from: '/hello-two', to: '/y' },
        });

        const res = await storage.list({
            type: 'link',
            limit: 'all',
            search: 'hello',
            searchFields: ['from'],
            where: { id: a.id },
        });
        expect(res.data).toHaveLength(1);
        expect(res.data[0]?.id).toBe(a.id);
    });

    it('searchFields naming a missing column throws', async () => {
        await expect(
            storage.list({
                type: 'link',
                limit: 'all',
                search: 'hello',
                searchFields: ['nonExistentColumn'],
            })
        ).rejects.toThrow('nonExistentColumn');
    });
});

// ============================================================================
// uniqueSlug
// ============================================================================

describe('uniqueSlug', () => {
    it('throws with an instructional error', () => {
        expect(() => storage.uniqueSlug('link', 'en', 'some-slug')).toThrow(
            'tableStorage does not support slugs'
        );
    });
});

// ============================================================================
// transaction
// ============================================================================

describe('transaction', () => {
    // NOTE: libsql :memory: opens a new connection after a transaction completes
    // (the old connection is detached), so post-transaction state cannot be
    // verified via getDb(). These tests instead verify: (a) the exception
    // propagates on rollback, (b) writes are visible within the callback, and
    // (c) the returned storage inside the callback is fully functional.

    function runTx<T>(
        fn: Parameters<NonNullable<typeof storage.transaction>>[0]
    ): Promise<T> {
        if (!storage.transaction) throw new Error('tableStorage must have transaction');
        return storage.transaction(fn) as Promise<T>;
    }

    it('propagates exception from the callback (rollback path)', async () => {
        let createdInsideTx = false;

        await expect(
            runTx(async (txStorage) => {
                const rec = await txStorage.create({
                    type: 'link',
                    fields: { from: '/tx1', to: '/ok' },
                });
                // Write is visible inside the transaction callback.
                const found = await txStorage.get(rec.id);
                expect(found?.id).toBe(rec.id);
                createdInsideTx = true;
                throw new Error('simulated failure');
            })
        ).rejects.toThrow('simulated failure');

        // The create was visible inside the callback before the throw.
        expect(createdInsideTx).toBe(true);
    });

    it('returns the result of the callback (commit path)', async () => {
        const ids: string[] = [];

        const result = await runTx<string>(async (txStorage) => {
            const a = await txStorage.create({
                type: 'link',
                fields: { from: '/tx1', to: '/a' },
            });
            const b = await txStorage.create({
                type: 'link',
                fields: { from: '/tx2', to: '/b' },
            });
            ids.push(a.id, b.id);
            // Both writes visible inside the callback.
            const res = await txStorage.list({ type: 'link', limit: 'all' });
            expect(res.data).toHaveLength(2);
            return 'done';
        });

        expect(result).toBe('done');
        expect(ids).toHaveLength(2);
    });
});

// ============================================================================
// Orchestrator integration
// ============================================================================

describe('entries-service integration', () => {
    function makeLinksPlugin(): PluginDefinition {
        return {
            package: '@astromech/links',
            entries: [
                {
                    type: 'link',
                    single: 'Link',
                    plural: 'Links',
                    titleField: false,
                    statuses: false,
                    slug: false,
                    trash: false,
                    storage: tableStorage(testLinksTable),
                    search: ['from', 'to'],
                    fields: [
                        { name: 'from', type: 'text', label: 'From' },
                        { name: 'to', type: 'text', label: 'To' },
                        { name: 'status', type: 'text', label: 'Status' },
                    ],
                },
            ],
        };
    }

    function configWithLinksPlugin(): AstromechConfig {
        return { ...makeTestConfig(), plugins: [makeLinksPlugin()] };
    }

    beforeEach(() => {
        setupTestConfig(configWithLinksPlugin());
    });

    it('create/get/update/delete round-trip via qualified type id', async () => {
        const created = await Astromech.entries.create({
            type: 'links/link',
            fields: { from: '/old', to: '/new', status: '301' },
        });

        expect(created.id).toMatch(ULID);
        expect(created.fields['from']).toBe('/old');
        expect(created.fields['to']).toBe('/new');

        // full: true — admin read; entry is unpublished
        const fetched = await Astromech.entries.get({
            type: 'links/link',
            id: created.id,
            full: true,
        });
        expect(fetched?.id).toBe(created.id);
        expect(fetched?.fields['to']).toBe('/new');

        const updated = (await Astromech.entries.update({
            type: 'links/link',
            id: created.id,
            data: { fields: { from: '/old', to: '/updated', status: '302' } },
        })) as Awaited<ReturnType<typeof Astromech.entries.create>>;
        expect(updated.fields['to']).toBe('/updated');

        await Astromech.entries.delete({ type: 'links/link', id: created.id });
        const gone = await Astromech.entries.get({ type: 'links/link', id: created.id });
        expect(gone).toBeNull();
    });

    it('query honors searchFields from type config', async () => {
        await Astromech.entries.create({
            type: 'links/link',
            fields: { from: '/hello', to: '/world' },
            status: 'published',
        });
        await Astromech.entries.create({
            type: 'links/link',
            fields: { from: '/foo', to: '/bar' },
            status: 'published',
        });
        await Astromech.entries.create({
            type: 'links/link',
            fields: { from: '/baz', to: '/hello-page' },
            status: 'published',
        });

        const res = await Astromech.entries.query({
            type: 'links/link',
            search: 'hello',
        });

        expect(res.data).toHaveLength(2);
    });
});
