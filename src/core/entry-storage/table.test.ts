/**
 * Storage-level tests for tableStorage plus orchestrator integration.
 *
 * Uses a scratch table created via raw DDL — no migration dependency.
 * The scratch table has columns matching the test scenarios: id, from, to,
 * status, enabled (boolean integer), createdAt/updatedAt (timestamp integers).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createTestDb, makeTestConfig, setupTestConfig } from '@/test/harness.js';
import { Astromech } from '@/sdk/local/index.js';
import type { AstromechConfig, PluginDefinition } from '@/types/index.js';
import { tableStorage } from './table.js';

// ============================================================================
// Scratch table definition
// ============================================================================

const testLinksTable = sqliteTable('test_links', {
    id: text('id').primaryKey(),
    from: text('from').notNull(),
    to: text('to').notNull(),
    status: text('status').notNull().default('301'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
});

const storage = tableStorage(testLinksTable);

// ============================================================================
// Test setup
// ============================================================================

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig();

    await db.run(
        sql`CREATE TABLE test_links (
            id text PRIMARY KEY,
            "from" text NOT NULL,
            "to" text NOT NULL,
            status text NOT NULL DEFAULT '301',
            enabled integer NOT NULL DEFAULT 1,
            "createdAt" integer NOT NULL,
            "updatedAt" integer NOT NULL
        )`
    );
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
        // SQLite stores timestamps as integer seconds — truncate before to avoid
        // sub-second false negatives.
        const before = new Date(Math.floor(Date.now() / 1000) * 1000);
        const record = await storage.create({
            type: 'link',
            fields: { from: '/old', to: '/new', status: '302', enabled: true },
        });

        expect(record.id).toMatch(/[0-9a-f-]{36}/);
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

        // Wait >1s to ensure updatedAt changes (SQLite stores integer seconds).
        await new Promise((r) => setTimeout(r, 1100));

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

describe('orchestrator integration', () => {
    function makeLinksPlugin(): PluginDefinition {
        return {
            package: '@astromech/links',
            entries: {
                link: {
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
            },
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

        expect(created.id).toMatch(/[0-9a-f-]{36}/);
        expect(created.fields['from']).toBe('/old');
        expect(created.fields['to']).toBe('/new');

        const fetched = await Astromech.entries.get({
            type: 'links/link',
            id: created.id,
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
        });
        await Astromech.entries.create({
            type: 'links/link',
            fields: { from: '/foo', to: '/bar' },
        });
        await Astromech.entries.create({
            type: 'links/link',
            fields: { from: '/baz', to: '/hello-page' },
        });

        const res = await Astromech.entries.query({
            type: 'links/link',
            search: 'hello',
        });

        expect(res.data).toHaveLength(2);
    });
});
