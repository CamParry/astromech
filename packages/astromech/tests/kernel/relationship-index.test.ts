/**
 * `index:rebuild` / `--check` — the parity test §8 calls for.
 *
 * The real assertion is the first one: content written through the NORMAL
 * service write paths must produce exactly the rows a rebuild derives from the
 * stored data. Everything else here is repair behaviour — detecting a deleted
 * row, a bogus row, staying idempotent, and staying inside a `--type` scope.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import {
    checkRelationshipIndex,
    rebuildRelationshipIndex,
} from '@/kernel/relationship-index.js';
import { createStorage } from '@/database/storage/create-storage.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { relationships, type RelationshipRow } from '@/database/schema.js';
import { entries as api } from '@/entries/service.js';
import { mediaApi } from '@/media/service.js';
import { createMediaStorage } from '@/media/storage.js';
import { usersApi } from '@/users/service.js';
import { tableStorage } from '@/entries/storage/table.js';
import { defineTable } from '@/database/define-table.js';
import { setStorageDriver } from '@/storage/registry.js';
import type { AstromechConfig, PluginDefinition, StorageDriver } from '@/types/index.js';

/** Media reads resolve a public URL through the driver; nothing here needs bytes. */
const noopStorage: StorageDriver = {
    name: 'noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<{ keys: string[] }> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string {
        return `/${key}`;
    },
};

const linksTable = defineTable('test_links', ({ col }) => ({
    id: col.id(),
    label: col.text({ notNull: true }),
    post: col.text(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

/** A table-backed entry type: its rows live outside the `entries` table. */
function linksPlugin(): PluginDefinition {
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
                storage: tableStorage(linksTable),
                fields: [
                    { name: 'label', type: 'text', label: 'Label' },
                    { name: 'post', type: 'relationship', label: 'Post', target: 'post' },
                ],
            },
        ],
    };
}

/**
 * `article` holds a relation flat and two more inside a repeater (one of them a
 * multi media relation); users and media hold relations too, so all three source
 * kinds are reachable.
 */
function makeIndexConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            article: {
                single: 'Article',
                plural: 'Articles',
                staging: true,
                fields: [
                    {
                        name: 'author',
                        type: 'relationship',
                        label: 'Author',
                        target: 'post',
                    },
                    {
                        name: 'sections',
                        type: 'repeater',
                        label: 'Sections',
                        fields: [
                            {
                                name: 'related',
                                type: 'relationship',
                                label: 'Related',
                                target: 'post',
                                multiple: true,
                            },
                            {
                                name: 'gallery',
                                type: 'media',
                                label: 'Gallery',
                                multiple: true,
                            },
                        ],
                    },
                ],
            },
        },
        users: {
            fields: [{ name: 'avatar', type: 'media', label: 'Avatar' }],
        },
        media: {
            fields: [
                { name: 'credit', type: 'relationship', label: 'Credit', target: 'post' },
            ],
        },
        plugins: [linksPlugin()],
    };
}

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(makeIndexConfig());
    setStorageDriver(noopStorage);
    await sql`CREATE TABLE test_links (
            id text PRIMARY KEY,
            label text NOT NULL,
            post text,
            created_at text NOT NULL,
            updated_at text NOT NULL
        )`.execute(db);
});

/** A media row, inserted through storage so no driver or real bytes are needed. */
async function createMedia(filename = 'a.png'): Promise<string> {
    const row = await createMediaStorage().create({
        filename,
        mimeType: 'image/png',
        size: 1,
    });
    return row.id;
}

/**
 * One of every source kind, written through the service write paths: an entry
 * with a flat relation plus a nested multi-relation and a nested media
 * relation, a table-backed entry, a user, and a media record.
 */
async function seedContent(): Promise<{ article: string; post: string; media: string }> {
    const post = await api.create({ type: 'post', title: 'Post' });
    const other = await api.create({ type: 'post', title: 'Other' });
    const mediaId = await createMedia();

    const article = await api.create({
        type: 'article',
        title: 'Article',
        fields: {
            author: post.id,
            sections: [
                { related: [post.id, other.id], gallery: [mediaId] },
                { related: [other.id] },
            ],
        },
    });
    await api.create({ type: 'links/link', fields: { label: 'One', post: post.id } });
    await usersApi.create({
        email: 'owner@test.dev',
        name: 'Owner',
        fields: { avatar: mediaId },
    });
    await mediaApi.update({ id: mediaId, data: { fields: { credit: post.id } } });

    return { article: article.id, post: post.id, media: mediaId };
}

/** Every stored row, in a stable order, so two runs compare directly. */
async function storedRows(): Promise<RelationshipRow[]> {
    const rows = await createRelationshipStorage().findAll();
    return rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function driftCount(report: {
    missing: unknown[];
    unexpected: unknown[];
    mismatched: unknown[];
}): number {
    return report.missing.length + report.unexpected.length + report.mismatched.length;
}

// ============================================================================
// Parity
// ============================================================================

describe('checkRelationshipIndex', () => {
    it('reports no drift for content written through the service write paths', async () => {
        await seedContent();

        const report = await checkRelationshipIndex();

        expect(driftCount(report)).toBe(0);
        // Guard against a vacuous pass: every source kind, the table-backed type
        // included, must actually have contributed rows for the parity to mean
        // anything.
        const rows = await storedRows();
        expect(
            [...new Set(rows.map((row) => row.sourceType ?? row.sourceKind))].sort()
        ).toEqual(['article', 'links/link', 'media', 'user']);
        expect(
            rows.filter((row) => row.schemaPath === 'sections[].related')
        ).toHaveLength(3);
        expect(rows.filter((row) => row.targetKind === 'media')).toHaveLength(2);
    });

    it('reports no drift for a staged entry, and derives its rows as staged', async () => {
        const { article } = await seedContent();
        const staged = await api.createStaged({ type: 'article', id: article });

        expect(driftCount(await checkRelationshipIndex())).toBe(0);

        await rebuildRelationshipIndex();
        const rows = await createRelationshipStorage().findBySource(staged.id, 'entry');
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.sourceStaged)).toBe(true);
        expect(driftCount(await checkRelationshipIndex())).toBe(0);
    });

    it('reports an empty index as entirely missing', async () => {
        await seedContent();
        await createRelationshipStorage().clear();

        const report = await checkRelationshipIndex();

        expect(report.missing.length).toBeGreaterThan(0);
        expect(report.unexpected).toEqual([]);
    });
});

// ============================================================================
// Repair
// ============================================================================

describe('rebuildRelationshipIndex', () => {
    it('detects a deleted row as missing and restores it', async () => {
        const { article, post } = await seedContent();
        await createStorage(relationships).deleteMany({
            sourceId: article,
            instancePath: 'author',
            targetId: post,
        });

        const before = await checkRelationshipIndex();
        expect(before.missing).toHaveLength(1);
        expect(before.missing[0]?.schemaPath).toBe('author');

        await rebuildRelationshipIndex();

        expect(driftCount(await checkRelationshipIndex())).toBe(0);
    });

    it('detects a row no field data holds as unexpected and removes it', async () => {
        const { article } = await seedContent();
        await createStorage(relationships).create({
            sourceId: article,
            sourceKind: 'entry',
            sourceType: 'article',
            schemaPath: 'author',
            instancePath: 'author',
            targetId: 'ghost',
            targetKind: 'entry',
            sourceStaged: false,
        });

        const before = await checkRelationshipIndex();
        expect(before.unexpected).toHaveLength(1);
        expect(before.unexpected[0]?.targetId).toBe('ghost');

        await rebuildRelationshipIndex();

        expect(driftCount(await checkRelationshipIndex())).toBe(0);
        const rows = await createRelationshipStorage().findAll();
        expect(rows.some((row) => row.targetId === 'ghost')).toBe(false);
    });

    it('removes rows left behind by a source that no longer exists', async () => {
        await seedContent();
        await createStorage(relationships).create({
            sourceId: 'purged-entry',
            sourceKind: 'entry',
            sourceType: 'article',
            schemaPath: 'author',
            instancePath: 'author',
            targetId: 'anything',
            targetKind: 'entry',
            sourceStaged: false,
        });

        const report = await rebuildRelationshipIndex();

        expect(report.orphanRowsRemoved).toBe(1);
        expect(driftCount(await checkRelationshipIndex())).toBe(0);
    });

    // If the rebuild re-minted item ids, the nested instance paths would change
    // on every run and this comparison would fail.
    it('is idempotent', async () => {
        await seedContent();

        const first = await rebuildRelationshipIndex();
        const afterFirst = await storedRows();
        const second = await rebuildRelationshipIndex();

        expect(await storedRows()).toEqual(afterFirst);
        expect(second.rowsWritten).toBe(first.rowsWritten);
        expect(second.orphanRowsRemoved).toBe(0);
    });
});

// ============================================================================
// `--type` scoping
// ============================================================================

describe('rebuildRelationshipIndex({ type })', () => {
    it('repairs the named type and leaves other types and user/media rows alone', async () => {
        const { article, post, media } = await seedContent();
        const storage = createStorage(relationships);

        // Drop an article row (must come back) and plant a bogus row on each of
        // the three scopes a `--type article` run must not touch.
        await storage.deleteMany({
            sourceId: article,
            instancePath: 'author',
            targetId: post,
        });
        await storage.create({
            sourceId: post,
            sourceKind: 'entry',
            sourceType: 'post',
            schemaPath: 'related',
            instancePath: 'related',
            targetId: 'ghost',
            targetKind: 'entry',
            sourceStaged: false,
        });
        await storage.create({
            sourceId: media,
            sourceKind: 'media',
            sourceType: null,
            schemaPath: 'credit',
            instancePath: 'credit',
            targetId: 'ghost',
            targetKind: 'entry',
            sourceStaged: false,
        });

        const report = await rebuildRelationshipIndex({ type: 'article' });

        expect(driftCount(await checkRelationshipIndex({ type: 'article' }))).toBe(0);
        expect(report.orphanRowsRemoved).toBe(0);

        const rows = await createRelationshipStorage().findAll();
        expect(rows.filter((row) => row.targetId === 'ghost')).toHaveLength(2);
    });
});
