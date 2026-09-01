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
import { emitTableStatements } from '@/database/table-snapshot';
import { cronTable } from '@/database/tables';
import { AstromechError } from '@/errors/astromech-error';

const EARLY = new Date('2020-01-01T00:00:00.000Z');
const MIDDLE = new Date('2022-06-01T12:00:00.000Z');
const LATE = new Date('2030-01-01T00:00:00.000Z');

/**
 * A throwaway table covering every column kind the wrapper converts. Local to
 * this file so the generic wrapper's tests do not move whenever a real table's
 * shape does.
 */
const entriesProbe = defineTable('entries_probe', ({ col }) => ({
    id: col.id(),
    type: col.text({ notNull: true }),
    locale: col.text({ notNull: true }),
    slug: col.text(),
    title: col.text({ notNull: true }),
    fields: col.json(),
    status: col.enum(['unpublished', 'published', 'scheduled'], {
        notNull: true,
        default: 'unpublished',
    }),
    publishedAt: col.timestamp(),
    deletedAt: col.timestamp(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

function entryRepository() {
    return createRepository(entriesProbe);
}

beforeEach(async () => {
    const db = await createTestDb();
    for (const statement of emitTableStatements(entriesProbe, 'sqlite')) {
        await sql.raw(statement).execute(db);
    }
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

        const { db, table } = repository.kysely();
        expect(table).toBe('entriesProbe');
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
        const where = { type: ['post', 'card'] } as unknown as Where<typeof entriesProbe>;
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
        const bogus = { nope: 'x' } as unknown as Where<typeof entriesProbe>;
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            /unknown column "nope"/
        );
    });

    it('throws when an in operand is not an array', async () => {
        const bogus = { type: { in: 'post' } } as unknown as Where<typeof entriesProbe>;
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            /expects an array/
        );
    });
});

describe('createRepository – where or', () => {
    it('ANDs the OR-ed branches with the sibling keys', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'post', locale: 'en', title: 'B' });
        await repository.create({ type: 'post', locale: 'en', title: 'C' });
        await repository.create({ type: 'note', locale: 'en', title: 'A' });

        const rows = await repository.findMany({
            where: { type: 'post', or: [{ title: 'A' }, { title: 'B' }] },
            orderBy: [['title', 'asc']],
        });
        expect(rows.map((r) => r.title)).toEqual(['A', 'B']);
        expect(rows.every((r) => r.type === 'post')).toBe(true);
    });

    it('ANDs the keys inside a single branch', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'en post' });
        await repository.create({ type: 'post', locale: 'de', title: 'de post' });
        await repository.create({ type: 'note', locale: 'de', title: 'de note' });

        const rows = await repository.findMany({
            where: { or: [{ type: 'post', locale: 'de' }, { type: 'note' }] },
            orderBy: [['title', 'asc']],
        });
        expect(rows.map((r) => r.title)).toEqual(['de note', 'de post']);
    });

    it('nests an or inside a branch', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'post', locale: 'en', title: 'B' });
        await repository.create({ type: 'post', locale: 'en', title: 'C' });
        await repository.create({ type: 'note', locale: 'en', title: 'D' });

        const rows = await repository.findMany({
            where: {
                or: [
                    { type: 'post', or: [{ title: 'A' }, { title: 'C' }] },
                    { type: 'note' },
                ],
            },
            orderBy: [['title', 'asc']],
        });
        expect(rows.map((r) => r.title)).toEqual(['A', 'C', 'D']);
    });

    it('serializes branch values through the column codec', async () => {
        // The load-bearing case: a Date inside a branch must be compared against
        // the ISO TEXT actually stored, exactly as a top-level key is.
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

        const rows = await repository.findMany({
            where: { or: [{ publishedAt: EARLY }, { publishedAt: { gte: LATE } }] },
            orderBy: [['publishedAt', 'asc']],
        });
        expect(rows.map((r) => r.title)).toEqual(['early', 'late']);
    });

    it('matches nothing for an empty branch list', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'post', locale: 'en', title: 'B' });

        expect(await repository.findMany({ where: { or: [] } })).toEqual([]);
        expect(await repository.count({ or: [] })).toBe(0);
    });

    it('throws when or is not an array', async () => {
        const bogus = { or: { title: 'A' } } as unknown as Where<typeof entriesProbe>;
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            AstromechError
        );
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            /"or" expects an array of where clauses/
        );
    });

    it('selects due and never-computed cron rows, the scheduler shape', async () => {
        const repository = createRepository(cronTable);
        await repository.create({ name: 'due', schedule: '* * * * *', nextRun: EARLY });
        await repository.create({ name: 'never', schedule: '* * * * *' });
        await repository.create({ name: 'future', schedule: '* * * * *', nextRun: LATE });
        await repository.create({
            name: 'disabled',
            schedule: '* * * * *',
            enabled: false,
            nextRun: EARLY,
        });

        const rows = await repository.findMany({
            where: {
                enabled: true,
                or: [{ nextRun: { lte: new Date() } }, { nextRun: null }],
            },
            orderBy: [['name', 'asc']],
        });
        expect(rows.map((r) => r.name)).toEqual(['due', 'never']);
    });
});

describe('createRepository – where contains', () => {
    it('matches a substring, case-insensitively', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'Hello World' });
        await repository.create({ type: 'post', locale: 'en', title: 'Goodbye' });

        const rows = await repository.findMany({
            where: { title: { contains: 'lo wor' } },
        });
        expect(rows.map((r) => r.title)).toEqual(['Hello World']);
    });

    it('treats % in the search text as a literal percent sign', async () => {
        // The defect this operator exists to fix: as a raw LIKE pattern,
        // `%100%%` matched every title starting "100".
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: '100% cotton' });
        await repository.create({ type: 'post', locale: 'en', title: '100 percent' });

        const rows = await repository.findMany({
            where: { title: { contains: '100%' } },
        });
        expect(rows.map((r) => r.title)).toEqual(['100% cotton']);
    });

    it('treats _ in the search text as a literal underscore', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'a_b' });
        await repository.create({ type: 'post', locale: 'en', title: 'axb' });

        const rows = await repository.findMany({ where: { title: { contains: 'a_b' } } });
        expect(rows.map((r) => r.title)).toEqual(['a_b']);
    });

    it('treats a backslash in the search text as a literal backslash', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'a\\b' });
        await repository.create({ type: 'post', locale: 'en', title: 'axb' });

        const rows = await repository.findMany({
            where: { title: { contains: 'a\\b' } },
        });
        expect(rows.map((r) => r.title)).toEqual(['a\\b']);
    });

    it('matches every row with a non-null value for an empty search', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A', slug: 'a' });
        await repository.create({ type: 'post', locale: 'en', title: 'B' });

        const titles = await repository.findMany({
            where: { title: { contains: '' } },
            orderBy: [['title', 'asc']],
        });
        expect(titles.map((r) => r.title)).toEqual(['A', 'B']);

        // `slug` is null on the second row, and NULL LIKE anything is NULL.
        const slugs = await repository.findMany({ where: { slug: { contains: '' } } });
        expect(slugs.map((r) => r.title)).toEqual(['A']);
    });

    it('throws when the contains operand is not a string', async () => {
        const bogus = { title: { contains: 5 } } as unknown as Where<typeof entriesProbe>;
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            AstromechError
        );
        await expect(entryRepository().findMany({ where: bogus })).rejects.toThrow(
            /"contains" on column "title" expects a string/
        );
    });

    it('differs from like, which still reads % as a wildcard', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: '100% cotton' });
        await repository.create({ type: 'post', locale: 'en', title: '100 percent' });

        const wildcard = await repository.findMany({
            where: { title: { like: '100%' } },
            orderBy: [['title', 'asc']],
        });
        expect(wildcard.map((r) => r.title)).toEqual(['100 percent', '100% cotton']);

        const literal = await repository.findMany({
            where: { title: { contains: '100%' } },
        });
        expect(literal.map((r) => r.title)).toEqual(['100% cotton']);
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

describe('createRepository – pluck', () => {
    it('returns one column of decoded values', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });
        await repository.create({ type: 'note', locale: 'en', title: 'B' });

        const titles = await repository.pluck('title', { orderBy: [['title', 'asc']] });
        expect(titles).toEqual(['A', 'B']);
    });

    it('decodes a non-text column — a Date stays a Date, a boolean a boolean', async () => {
        const repository = createRepository(cronTable);
        await repository.create({
            name: 'demo-job',
            schedule: '* * * * *',
            enabled: false,
            nextRun: MIDDLE,
        });

        expect(await repository.pluck('nextRun')).toEqual([MIDDLE]);
        expect(await repository.pluck('enabled')).toEqual([false]);
    });

    it('returns null for a null cell', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });

        expect(await repository.pluck('publishedAt')).toEqual([null]);
    });

    it('honours where, orderBy, limit and offset', async () => {
        const repository = entryRepository();
        for (const title of ['A', 'B', 'C', 'D']) {
            await repository.create({ type: 'post', locale: 'en', title });
        }
        await repository.create({ type: 'note', locale: 'en', title: 'E' });

        expect(
            await repository.pluck('title', {
                where: { type: 'post' },
                orderBy: [['title', 'desc']],
                limit: 2,
                offset: 1,
            })
        ).toEqual(['C', 'B']);
    });

    it('offsets with no limit', async () => {
        const repository = entryRepository();
        for (const title of ['A', 'B', 'C', 'D']) {
            await repository.create({ type: 'post', locale: 'en', title });
        }

        expect(
            await repository.pluck('title', { orderBy: [['title', 'asc']], offset: 2 })
        ).toEqual(['C', 'D']);
    });

    it('throws for an unknown column name', async () => {
        const repository = entryRepository();
        // Only a loosely-typed caller can reach this; the typed signature can't.
        const bogus = 'nope' as 'title';
        await expect(repository.pluck(bogus)).rejects.toThrow(AstromechError);
        await expect(repository.pluck(bogus)).rejects.toThrow(/unknown column "nope"/);
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

describe('createRepository – createMany', () => {
    it('inserts every row, fills app defaults and returns the count', async () => {
        const repository = entryRepository();

        const inserted = await repository.createMany([
            { type: 'post', locale: 'en', title: 'A', publishedAt: MIDDLE },
            { type: 'post', locale: 'en', title: 'B', fields: { body: 'world' } },
            { type: 'note', locale: 'en', title: 'C' },
        ]);
        expect(inserted).toBe(3);

        const rows = await repository.findMany({ orderBy: [['title', 'asc']] });
        expect(rows.map((r) => r.title)).toEqual(['A', 'B', 'C']);
        for (const row of rows) {
            expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
            expect(row.createdAt).toBeInstanceOf(Date);
            expect(row.updatedAt).toBeInstanceOf(Date);
            expect(row.status).toBe('unpublished');
        }
        expect(rows[0]?.publishedAt).toEqual(MIDDLE);
        expect(rows[1]?.fields).toEqual({ body: 'world' });
    });

    it('returns 0 and inserts nothing for an empty array', async () => {
        const repository = entryRepository();
        expect(await repository.createMany([])).toBe(0);
        expect(await repository.count()).toBe(0);
    });

    it('applies a column SQL default to a row that omits it', async () => {
        // Single-row `create` leaves an omitted column out of the INSERT, so the
        // table default applies. In a multi-row insert Kysely takes the union of
        // the rows' keys, and its SQLite compiler emits `null` for the cells a
        // row does not supply (SQLite has no `DEFAULT` keyword in VALUES). So a
        // column with a SQL default gets NULL instead, and a NOT NULL one fails.
        const repository = createRepository(cronTable);

        const single = await repository.create({
            name: 'single',
            schedule: '* * * * *',
        });
        expect(single.enabled).toBe(true);

        await repository.createMany([
            { name: 'with-flag', schedule: '* * * * *', enabled: false },
            { name: 'without-flag', schedule: '*/5 * * * *' },
        ]);

        const row = await repository.findOne({ name: 'without-flag' });
        expect(row?.enabled).toBe(true);
    });

    it('rejects a primary-key collision without onConflict', async () => {
        const repository = createRepository(cronTable);
        await repository.create({
            name: 'demo-job',
            schedule: '* * * * *',
            enabled: false,
        });

        await expect(
            repository.createMany([
                { name: 'demo-job', schedule: 'CHANGED' },
                { name: 'other-job', schedule: '*/5 * * * *' },
            ])
        ).rejects.toThrow();
    });

    it('skips a colliding row under onConflict: ignore and leaves it untouched', async () => {
        const repository = createRepository(cronTable);
        await repository.create({
            name: 'demo-job',
            schedule: '* * * * *',
            enabled: false,
            nextRun: MIDDLE,
        });

        const inserted = await repository.createMany(
            [
                { name: 'demo-job', schedule: 'CHANGED', enabled: true, nextRun: LATE },
                {
                    name: 'other-job',
                    schedule: '*/5 * * * *',
                    enabled: true,
                    nextRun: LATE,
                },
            ],
            { onConflict: 'ignore' }
        );
        expect(inserted).toBe(1);

        const existing = await repository.findOne({ name: 'demo-job' });
        expect(existing?.schedule).toBe('* * * * *');
        expect(existing?.enabled).toBe(false);
        expect(existing?.nextRun).toEqual(MIDDLE);
        expect(await repository.count()).toBe(2);
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

describe('createRepository – reserved column names', () => {
    it('throws at construction when the table declares a column named or', () => {
        // `or` is the one where-key that is not a column, so such a column would
        // be unreachable through the DSL. The failure belongs at construction,
        // not at the query that silently drops the filter.
        const clashing = defineTable('or_probe', ({ col }) => ({
            id: col.id(),
            or: col.text(),
        }));

        expect(() => createRepository(clashing)).toThrow(AstromechError);
        expect(() => createRepository(clashing)).toThrow(
            /"or" is reserved by the where DSL/
        );
    });
});

describe('createRepository – kysely escape hatch', () => {
    it('exposes the generic handle and resolved table key', async () => {
        const repository = entryRepository();
        await repository.create({ type: 'post', locale: 'en', title: 'A' });

        const { db, table } = repository.kysely();
        const row = await db
            .selectFrom(table)
            .select((eb) => eb.fn.countAll<number>().as('total'))
            .executeTakeFirst();
        expect(Number(row?.total)).toBe(1);

        const { rows } = await sql`SELECT title FROM entries_probe`.execute(db);
        expect(rows).toHaveLength(1);
    });

    it('exposes the table', () => {
        expect(entryRepository().table.name).toBe('entries_probe');
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

        const { db, table, where } = repository.kysely();
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
