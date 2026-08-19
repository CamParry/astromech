/**
 * `createRepository` — the generic `Table`-backed CRUD wrapper.
 *
 * The load-bearing behaviour here is value serialization: every `where`
 * comparison literal goes through the column's `col.serialize`, so a `Date`
 * predicate compares against ISO TEXT rather than silently matching nothing.
 * These tests assert against real stored rows (temp-file libsql via the
 * harness), not against generated SQL.
 */
import type { Where } from '@/database/repository/create-repository';
import { createTestDb } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineTable } from '@/database/define-table';
import { createRepository } from '@/database/repository/create-repository';
import { cronTable } from '@/database/schema';
import { entriesTable } from '@/entries/schema';

const EARLY = new Date('2020-01-01T00:00:00.000Z');
const MIDDLE = new Date('2022-06-01T12:00:00.000Z');
const LATE = new Date('2030-01-01T00:00:00.000Z');

function entryRepository() {
    return createRepository(entriesTable);
}

beforeEach(async () => {
    await createTestDb();
});

describe('createRepository – round trip', () => {
    it('creates and reads back decoded domain values', async () => {
        const repository = entryRepository();

        const created = await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Hello',
            fields: { body: 'world' },
            publishedAt: MIDDLE,
        });

        expect(created.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(created.createdAt).toBeInstanceOf(Date);
        expect(created.publishedAt).toEqual(MIDDLE);
        expect(created.fields).toEqual({ body: 'world' });
        expect(created.status).toBe('unpublished');

        const found = await repository.findOne({ id: created.id });
        expect(found?.title).toBe('Hello');
        expect(found?.createdAt).toBeInstanceOf(Date);
        expect(found?.publishedAt).toEqual(MIDDLE);
        expect(found?.fields).toEqual({ body: 'world' });
    });

    it('decodes a boolean column back to a boolean', async () => {
        const repository = createRepository(cronTable);

        const created = await repository.create({
            name: 'demo-job',
            schedule: '* * * * *',
            enabled: false,
            nextRun: MIDDLE,
        });

        expect(created.enabled).toBe(false);
        const found = await repository.findOne({ name: 'demo-job' });
        expect(found?.enabled).toBe(false);
        expect(found?.nextRun).toEqual(MIDDLE);
        expect(found?.lock).toBeNull();
    });

    it('returns null from findOne when nothing matches', async () => {
        expect(await entryRepository().findOne({ id: 'missing' })).toBeNull();
    });

    it('stores timestamps as ISO TEXT (the reason where-values are serialized)', async () => {
        const repository = entryRepository();
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Raw',
            publishedAt: MIDDLE,
        });

        const { db, table } = repository.query();
        expect(table).toBe('entries');
        const raw = await db.selectFrom(table).selectAll().executeTakeFirst();
        expect(raw?.['publishedAt']).toBe('2022-06-01T12:00:00.000Z');
    });
});

describe('createRepository – where', () => {
    it('treats a bare value as eq', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'note', locale: 'en', title: 'B' });

        const rows = await repository.findMany({ where: { type: 'note' } });
        expect(rows.map((r) => r.title)).toEqual(['B']);
    });

    it('treats a bare null as IS NULL, and actually filters', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'live' });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'trashed',
            deletedAt: MIDDLE,
        });

        const all = await repository.findMany();
        expect(all).toHaveLength(2);

        const live = await repository.findMany({ where: { deletedAt: null } });
        expect(live.map((r) => r.title)).toEqual(['live']);
    });

    it('treats { ne: null } as IS NOT NULL', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'live' });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'trashed',
            deletedAt: MIDDLE,
        });

        const trashed = await repository.findMany({ where: { deletedAt: { ne: null } } });
        expect(trashed.map((r) => r.title)).toEqual(['trashed']);
    });

    it('serializes each element of an in list', async () => {
        const repository = entryRepository();
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'early',
            publishedAt: EARLY,
        });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'late',
            publishedAt: LATE,
        });

        const rows = await repository.findMany({
            where: { publishedAt: { in: [EARLY] } },
        });
        expect(rows.map((r) => r.title)).toEqual(['early']);
    });

    it('serializes notIn elements too', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'note', locale: 'en', title: 'B' });

        const rows = await repository.findMany({ where: { type: { notIn: ['note'] } } });
        expect(rows.map((r) => r.title)).toEqual(['A']);
    });

    it('reads a bare array as in', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'note', locale: 'en', title: 'B' });
        await repository.create({ type: 'card', locale: 'en', title: 'C' });

        // Bare arrays are a runtime lenience for loosely-typed callers; the
        // typed DSL spells this `{ in: [...] }`.
        const where = { type: ['post', 'card'] } as unknown as Where<typeof entriesTable>;
        const rows = await repository.findMany({
            where,
            orderBy: [['title', 'asc']],
        });
        expect(rows.map((r) => r.title)).toEqual(['A', 'C']);
    });

    it('compares a Date with lte against ISO-TEXT storage', async () => {
        const repository = entryRepository();
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'early',
            publishedAt: EARLY,
        });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'middle',
            publishedAt: MIDDLE,
        });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'late',
            publishedAt: LATE,
        });

        const due = await repository.findMany({
            where: { publishedAt: { lte: new Date('2025-01-01T00:00:00.000Z') } },
            orderBy: [['publishedAt', 'asc']],
        });
        expect(due.map((r) => r.title)).toEqual(['early', 'middle']);

        const future = await repository.findMany({
            where: { publishedAt: { gt: new Date('2025-01-01T00:00:00.000Z') } },
        });
        expect(future.map((r) => r.title)).toEqual(['late']);
    });

    it('compares a bare Date with eq', async () => {
        const repository = entryRepository();
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'middle',
            publishedAt: MIDDLE,
        });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'late',
            publishedAt: LATE,
        });

        const rows = await repository.findMany({ where: { publishedAt: MIDDLE } });
        expect(rows.map((r) => r.title)).toEqual(['middle']);
    });

    it('passes a like pattern through raw', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'Hello world' });
        await repository.create({ type: 'post', locale: 'en', title: 'Goodbye' });

        const rows = await repository.findMany({ where: { title: { like: 'Hello%' } } });
        expect(rows.map((r) => r.title)).toEqual(['Hello world']);
    });

    it('ANDs multiple keys together', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'post', locale: 'de', title: 'B' });

        const rows = await repository.findMany({ where: { type: 'post', locale: 'de' } });
        expect(rows.map((r) => r.title)).toEqual(['B']);
    });

    it('skips undefined values entirely', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });

        const rows = await repository.findMany({ where: { deletedAt: undefined } });
        expect(rows).toHaveLength(1);
    });

    it('reads an object on a json column as a VALUE, even with operator-shaped keys', async () => {
        const repository = entryRepository();
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'trap',
            fields: { eq: 'trap' },
        });
        await repository.create({ type: 'post', locale: 'en', title: 'other' });

        const found = await repository.findOne({ fields: { eq: 'trap' } });
        expect(found?.title).toBe('trap');
    });

    it('throws for an unknown column key', async () => {
        const bogus = { nope: 'x' } as unknown as Where<typeof entriesTable>;
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            /unknown column "nope"/
        );
    });

    it('throws when an in operand is not an array', async () => {
        const bogus = { type: { in: 'post' } } as unknown as Where<typeof entriesTable>;
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            /expects an array/
        );
    });
});

describe('createRepository – findMany paging + ordering', () => {
    it('orders, limits and offsets', async () => {
        const repository = entryRepository();
        for (const title of ['A', 'B', 'C', 'D']) {
            await repository.create({ type: 'post', locale: 'en', title });
        }

        const page = await repository.findMany({
            orderBy: [['title', 'desc']],
            limit: 2,
            offset: 1,
        });
        expect(page.map((r) => r.title)).toEqual(['C', 'B']);
    });

    it('offsets with no limit — everything past the first N', async () => {
        // SQLite only admits OFFSET inside a LIMIT clause, so the wrapper emits
        // `LIMIT -1 OFFSET n` here. A regression is a driver syntax error, not a
        // wrong result.
        const repository = entryRepository();
        for (const title of ['A', 'B', 'C', 'D']) {
            await repository.create({ type: 'post', locale: 'en', title });
        }

        const rest = await repository.findMany({
            orderBy: [['title', 'asc']],
            offset: 2,
        });
        expect(rest.map((r) => r.title)).toEqual(['C', 'D']);

        const none = await repository.findMany({
            orderBy: [['title', 'asc']],
            offset: 9,
        });
        expect(none).toEqual([]);
    });
});

describe('createRepository – count', () => {
    it('counts all rows without a where', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'note', locale: 'en', title: 'B' });

        expect(await repository.count()).toBe(2);
    });

    it('counts filtered rows', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'note', locale: 'en', title: 'B' });

        expect(await repository.count({ type: 'note' })).toBe(1);
        expect(await repository.count({ type: 'nothing' })).toBe(0);
    });
});

describe('createRepository – update', () => {
    it('writes only the provided keys and returns the decoded row', async () => {
        const repository = entryRepository();
        const created = await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Before',
            fields: { body: 'kept' },
        });

        const updated = await repository.update(created.id, { title: 'After' });
        expect(updated.title).toBe('After');
        expect(updated.fields).toEqual({ body: 'kept' });
    });

    it('auto-stamps an onUpdate column the caller did not supply', async () => {
        const repository = entryRepository();
        const created = await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Before',
        });

        await new Promise((resolve) => setTimeout(resolve, 5));
        const updated = await repository.update(created.id, { title: 'After' });

        expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
        expect(updated.createdAt).toEqual(created.createdAt);
    });

    it('throws when no row matches the id', async () => {
        await expect(entryRepository().update('missing', { title: 'x' })).rejects.toThrow(
            /no row found for id "missing"/
        );
    });

    it('throws when the table has no single primary key', async () => {
        const pkless = defineTable('pkless_probe', ({ col }) => ({
            label: col.text({ notNull: true }),
        }));

        await expect(
            createRepository(pkless).update('x', { label: 'y' })
        ).rejects.toThrow(/exactly one primary-key column/);
        await expect(createRepository(pkless).delete('x')).rejects.toThrow(
            /exactly one primary-key column/
        );
    });
});

describe('createRepository – delete', () => {
    it('hard-deletes by primary key', async () => {
        const repository = entryRepository();
        const created = await repository.create({
            type: 'post',
            locale: 'en',
            title: 'A',
        });

        await repository.delete(created.id);
        expect(await repository.count()).toBe(0);
    });
});

describe('createRepository – bulk writes', () => {
    it('updateMany returns the affected count and stamps onUpdate', async () => {
        const repository = entryRepository();
        const first = await repository.create({
            type: 'post',
            locale: 'en',
            title: 'A',
            status: 'scheduled',
            publishedAt: EARLY,
        });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'B',
            status: 'scheduled',
            publishedAt: LATE,
        });

        await new Promise((resolve) => setTimeout(resolve, 5));
        const affected = await repository.updateMany(
            { status: 'scheduled', publishedAt: { lte: new Date() } },
            { status: 'published' }
        );
        expect(affected).toBe(1);

        const published = await repository.findMany({ where: { status: 'published' } });
        expect(published.map((r) => r.title)).toEqual(['A']);
        expect(published[0]?.updatedAt.getTime()).toBeGreaterThan(
            first.updatedAt.getTime()
        );
    });

    it('updateMany returns 0 when nothing matched', async () => {
        const repository = entryRepository();
        expect(await repository.updateMany({ type: 'ghost' }, { title: 'x' })).toBe(0);
    });

    it('deleteMany returns the affected count', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'post', locale: 'en', title: 'B' });
        await repository.create({ type: 'note', locale: 'en', title: 'C' });

        expect(await repository.deleteMany({ type: 'post' })).toBe(2);
        expect(await repository.count()).toBe(1);
        expect(await repository.deleteMany({ type: 'ghost' })).toBe(0);
    });
});

describe('createRepository – upsert', () => {
    it('inserts when there is no conflict', async () => {
        const repository = createRepository(cronTable);

        const row = await repository.upsert({
            name: 'demo-job',
            schedule: '* * * * *',
            enabled: false,
        });

        expect(row.name).toBe('demo-job');
        expect(row.schedule).toBe('* * * * *');
        expect(row.enabled).toBe(false);
        expect(await repository.count()).toBe(1);
    });

    it('updates the provided non-target columns on conflict', async () => {
        const repository = createRepository(cronTable);
        await repository.upsert({
            name: 'demo-job',
            schedule: '* * * * *',
            enabled: false,
        });

        const row = await repository.upsert({
            name: 'demo-job',
            schedule: '*/5 * * * *',
        });

        expect(row.schedule).toBe('*/5 * * * *');
        // `enabled` was not provided on the second call, so it is untouched.
        expect(row.enabled).toBe(false);
        expect(await repository.count()).toBe(1);
    });

    it('honours an explicit set', async () => {
        const repository = createRepository(cronTable);
        await repository.upsert({ name: 'demo-job', schedule: '* * * * *' });

        const row = await repository.upsert(
            { name: 'demo-job', schedule: '*/5 * * * *' },
            { set: { enabled: false } }
        );

        expect(row.enabled).toBe(false);
        // Only the explicit set was written.
        expect(row.schedule).toBe('* * * * *');
    });
});

describe('createRepository – query escape hatch', () => {
    it('exposes the generic handle and resolved table key', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });

        const { db, table } = repository.query();
        const row = await db
            .selectFrom(table)
            .select((eb) => eb.fn.countAll<number>().as('total'))
            .executeTakeFirst();
        expect(Number(row?.total)).toBe(1);

        const { rows } = await sql`SELECT title FROM entries`.execute(db);
        expect(rows).toHaveLength(1);
    });

    it('exposes the table', () => {
        expect(entryRepository().table.name).toBe('entries');
    });

    it('composes the exposed where compiler with a raw or in one statement', async () => {
        const repository = entryRepository();
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Hello world',
            slug: 'hello',
        });
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Goodbye',
            slug: 'hello-again',
        });
        // Excluded by the DSL half (trashed), matched by the raw half.
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Hello trashed',
            slug: 'trashed',
            deletedAt: MIDDLE,
        });
        // Excluded by the DSL half (wrong type), matched by the raw half.
        await repository.create({
            type: 'note',
            locale: 'en',
            title: 'Hello note',
            slug: 'note',
        });
        // Matched by neither half of the OR.
        await repository.create({
            type: 'post',
            locale: 'en',
            title: 'Unrelated',
            slug: 'unrelated',
        });

        const { db, table, where } = repository.query();
        const dsl = where({ type: 'post', deletedAt: null });
        const rows = await db
            .selectFrom(table)
            .selectAll()
            .where((eb) =>
                eb.and([
                    dsl(eb),
                    eb.or([
                        eb('title', 'like', '%Hello%'),
                        eb('slug', 'like', '%hello%'),
                    ]),
                ])
            )
            .orderBy('title', 'asc')
            .execute();

        expect(rows.map((row) => row['title'])).toEqual(['Goodbye', 'Hello world']);
    });
});
