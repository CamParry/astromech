/**
 * `apps/demo/migrations/0001_entry_content.ts` over a database holding the old
 * one-row-per-locale shape: the split itself, and the id rewrites it has to make
 * everywhere an old row id was stored.
 *
 * The chain is applied by hand (baseline, then the migration under test) rather
 * than through the harness, which always migrates to latest.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { Kysely, sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** A 26-character ULID-shaped id, so the quoted-string rewrite is realistic. */
function id(name: string): string {
    return `01J${name.toUpperCase().padEnd(23, '0')}`;
}

const DE = id('de');
const EN = id('en');
const STAGED = id('staged');
const B1 = id('b1');
const B2 = id('b2');
const C1 = id('c1');
const C2 = id('c2');
const PAGE = id('page');
const VDE = id('vde');
const VSTAGED = id('vstaged');
const VPAGE = id('vpage');
const TOKEN_ROW = id('tok');

type Migration = { up(db: Kysely<unknown>): Promise<void> };

let dir: string;
let db: Kysely<unknown>;

async function loadMigration(file: string): Promise<Migration> {
    return (await import(
        new URL(`../../../../apps/demo/migrations/${file}`, import.meta.url).href
    )) as Migration;
}

/** One old-shape `entries` row. */
async function insertOldEntry(row: {
    id: string;
    type: string;
    locale: string;
    localeGroup: string;
    slug: string | null;
    title: string;
    fields: string;
    stagedFor?: string | null;
    deletedAt?: string | null;
    createdAt: string;
}): Promise<void> {
    await sql`
        INSERT INTO entries (
            id, type, locale, locale_group, slug, title, fields, status,
            staged_for, published_at, deleted_at, created_at, updated_at
        ) VALUES (
            ${row.id}, ${row.type}, ${row.locale}, ${row.localeGroup}, ${row.slug},
            ${row.title}, ${row.fields}, 'unpublished', ${row.stagedFor ?? null}, NULL,
            ${row.deletedAt ?? null}, ${row.createdAt}, ${row.createdAt}
        )
    `.execute(db);
}

async function insertOldVersion(versionId: string, entryId: string): Promise<void> {
    await sql`
        INSERT INTO entry_versions (
            id, entry_id, version_number, title, slug, fields, status, created_at
        ) VALUES (
            ${versionId}, ${entryId}, 1, 'v1', NULL, ${`{"related":["${EN}"]}`},
            'unpublished', '2024-03-01T00:00:00.000Z'
        )
    `.execute(db);
}

async function insertRelationship(row: {
    sourceId: string;
    sourceType: string;
    schemaPath: string;
    instancePath: string;
    targetId: string;
}): Promise<void> {
    await sql`
        INSERT INTO relationships (
            source_id, source_kind, source_type, schema_path, instance_path,
            target_id, target_kind, source_staged
        ) VALUES (
            ${row.sourceId}, 'entry', ${row.sourceType}, ${row.schemaPath},
            ${row.instancePath}, ${row.targetId}, 'entry', 0
        )
    `.execute(db);
}

async function rows<T>(query: string): Promise<T[]> {
    const result = await sql<T>`${sql.raw(query)}`.execute(db);
    return result.rows;
}

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'astromech-entry-content-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    db = new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
    const baseline = await loadMigration('0000_baseline.ts');
    await baseline.up(db);

    // Group A: `de` is the oldest canonical row, so its id becomes the entry id.
    await insertOldEntry({
        id: DE,
        type: 'post',
        locale: 'de',
        localeGroup: 'group-a',
        slug: 'a-de',
        title: 'A (de)',
        fields: '{}',
        createdAt: '2024-01-01T00:00:00.000Z',
    });
    await insertOldEntry({
        id: EN,
        type: 'post',
        locale: 'en',
        localeGroup: 'group-a',
        slug: 'a-en',
        title: 'A (en)',
        fields: '{}',
        createdAt: '2024-02-01T00:00:00.000Z',
    });
    await insertOldEntry({
        id: STAGED,
        type: 'post',
        locale: 'en',
        localeGroup: 'group-a-staged',
        slug: 'a-en',
        title: 'A (en, staged)',
        fields: '{}',
        stagedFor: EN,
        createdAt: '2024-02-02T00:00:00.000Z',
    });

    // Group B: one locale trashed, one live — the entry survives.
    await insertOldEntry({
        id: B1,
        type: 'post',
        locale: 'en',
        localeGroup: 'group-b',
        slug: 'b-en',
        title: 'B (en)',
        fields: '{}',
        createdAt: '2024-01-02T00:00:00.000Z',
    });
    await insertOldEntry({
        id: B2,
        type: 'post',
        locale: 'de',
        localeGroup: 'group-b',
        slug: 'b-de',
        title: 'B (de)',
        fields: '{}',
        deletedAt: '2024-04-01T00:00:00.000Z',
        createdAt: '2024-01-03T00:00:00.000Z',
    });

    // Group C: every locale trashed — the entry is trashed.
    await insertOldEntry({
        id: C1,
        type: 'post',
        locale: 'en',
        localeGroup: 'group-c',
        slug: 'c-en',
        title: 'C (en)',
        fields: '{}',
        deletedAt: '2024-04-02T00:00:00.000Z',
        createdAt: '2024-01-04T00:00:00.000Z',
    });
    await insertOldEntry({
        id: C2,
        type: 'post',
        locale: 'de',
        localeGroup: 'group-c',
        slug: 'c-de',
        title: 'C (de)',
        fields: '{}',
        deletedAt: '2024-04-03T00:00:00.000Z',
        createdAt: '2024-01-05T00:00:00.000Z',
    });

    // A page relating to group A's `en` row — the id that is about to die.
    await insertOldEntry({
        id: PAGE,
        type: 'page',
        locale: 'en',
        localeGroup: 'group-d',
        slug: 'page',
        title: 'Page',
        fields: `{"related":["${EN}"]}`,
        createdAt: '2024-01-06T00:00:00.000Z',
    });

    await insertOldVersion(VDE, DE);
    await insertOldVersion(VSTAGED, STAGED);
    await insertOldVersion(VPAGE, PAGE);

    await sql`
        INSERT INTO entry_preview_tokens (id, entry_id, token, expires_at, created_at)
        VALUES (
            ${TOKEN_ROW}, ${EN}, 'token-hash', '2024-05-01T00:00:00.000Z',
            '2024-04-01T00:00:00.000Z'
        )
    `.execute(db);

    // The page points at the dying `en` row; the canonical and its staged row
    // share one edge, and the staged row carries a second one alone.
    await insertRelationship({
        sourceId: PAGE,
        sourceType: 'page',
        schemaPath: 'related',
        instancePath: 'related',
        targetId: EN,
    });
    await insertRelationship({
        sourceId: EN,
        sourceType: 'post',
        schemaPath: 'related',
        instancePath: 'related',
        targetId: PAGE,
    });
    await insertRelationship({
        sourceId: STAGED,
        sourceType: 'post',
        schemaPath: 'related',
        instancePath: 'related',
        targetId: PAGE,
    });
    await insertRelationship({
        sourceId: STAGED,
        sourceType: 'post',
        schemaPath: 'links',
        instancePath: 'links.0',
        targetId: PAGE,
    });

    const migration = await loadMigration('0001_entry_content.ts');
    await migration.up(db);
});

afterEach(async () => {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
});

describe('0001_entry_content', () => {
    it('keeps one entry per locale group, trashed only when every locale was', async () => {
        const entries = await rows<{
            id: string;
            type: string;
            deleted_at: string | null;
        }>('SELECT id, type, deleted_at FROM entries ORDER BY id');

        expect(entries.map((e) => e.id).sort()).toEqual([B1, C1, DE, PAGE].sort());
        const byId = new Map(entries.map((e) => [e.id, e]));
        expect(byId.get(DE)?.deleted_at).toBeNull();
        expect(byId.get(B1)?.deleted_at).toBeNull();
        expect(byId.get(C1)?.deleted_at).toBe('2024-04-02T00:00:00.000Z');
        expect(byId.get(PAGE)?.type).toBe('page');
    });

    it('keeps every old row as a content row under its entry, staging intact', async () => {
        const content = await rows<{
            id: string;
            entry_id: string;
            staged_for: string | null;
        }>('SELECT id, entry_id, staged_for FROM entry_content');

        const byId = new Map(content.map((row) => [row.id, row]));
        expect(content).toHaveLength(8);
        expect(byId.get(DE)?.entry_id).toBe(DE);
        expect(byId.get(EN)?.entry_id).toBe(DE);
        expect(byId.get(STAGED)?.entry_id).toBe(DE);
        expect(byId.get(STAGED)?.staged_for).toBe(EN);
        expect(byId.get(B2)?.entry_id).toBe(B1);
        expect(byId.get(C2)?.entry_id).toBe(C1);
        expect(byId.get(PAGE)?.entry_id).toBe(PAGE);
    });

    it('re-keys versions onto the content row they snapshot', async () => {
        const versions = await rows<{ id: string; content_id: string }>(
            'SELECT id, content_id FROM entry_versions'
        );
        const byId = new Map(versions.map((row) => [row.id, row.content_id]));
        expect(byId.get(VDE)).toBe(DE);
        expect(byId.get(VSTAGED)).toBe(STAGED);
        expect(byId.get(VPAGE)).toBe(PAGE);
    });

    it('rewrites a dead row id stored in a relationship field value', async () => {
        const [content] = await rows<{ fields: string }>(
            `SELECT fields FROM entry_content WHERE id = '${PAGE}'`
        );
        const [version] = await rows<{ fields: string }>(
            `SELECT fields FROM entry_versions WHERE id = '${VPAGE}'`
        );

        expect(JSON.parse(content?.fields ?? '{}')).toEqual({ related: [DE] });
        expect(JSON.parse(version?.fields ?? '{}')).toEqual({ related: [DE] });
    });

    it('remaps both ends of the index and marks the staged-only edge', async () => {
        const edges = await rows<{
            source_id: string;
            instance_path: string;
            target_id: string;
            source_staged: number;
        }>(
            'SELECT source_id, instance_path, target_id, source_staged ' +
                'FROM relationships ORDER BY instance_path, source_id'
        );

        expect(edges).toEqual([
            {
                source_id: DE,
                instance_path: 'links.0',
                target_id: PAGE,
                source_staged: 1,
            },
            {
                source_id: DE,
                instance_path: 'related',
                target_id: PAGE,
                source_staged: 0,
            },
            {
                source_id: PAGE,
                instance_path: 'related',
                target_id: DE,
                source_staged: 0,
            },
        ]);
    });

    it('carries the newest preview token onto the entry', async () => {
        const [entry] = await rows<{
            preview_token: string | null;
            preview_token_expires_at: string | null;
        }>(
            `SELECT preview_token, preview_token_expires_at FROM entries WHERE id = '${DE}'`
        );

        expect(entry?.preview_token).toBe('token-hash');
        expect(entry?.preview_token_expires_at).toBe('2024-05-01T00:00:00.000Z');
    });
});
