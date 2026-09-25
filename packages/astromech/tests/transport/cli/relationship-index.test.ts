/**
 * `index:rebuild` / `--check` — the parity test §8 calls for.
 *
 * The real assertion is the first one: content written through the NORMAL
 * service write paths must produce exactly the rows a rebuild derives from the
 * stored data. Everything else here is repair behaviour — detecting a deleted
 * row, a bogus row, staying idempotent, and staying inside a `--type` scope.
 */
import type { RelationshipRow } from '@/database/tables';
import type { AstromechConfig } from '@/types/index';
import { noopStorage } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { createRepository } from '@/database/repository/create-repository';
import { relationshipsTable } from '@/database/tables';
import { mediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';
import {
    checkRelationshipIndex,
    rebuildRelationshipIndex,
} from '@/transport/cli/relationship-index';

const api = currentServices.entries;
const mediaService = currentServices.media;
const usersService = currentServices.users;

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
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeIndexConfig());
    setStorageDriver(noopStorage);
});

/** A media row, inserted through the repository so no driver or real bytes are needed. */
async function createMedia(filename = 'a.png'): Promise<string> {
    const row = await mediaRepository.create(
        {
            filename,
            mimeType: 'image/png',
            size: 1,
        },
        {}
    );
    return row.id;
}

/**
 * One of every source kind, written through the service write paths: an entry
 * with a flat relation plus a nested multi-relation and a nested media
 * relation, a user, and a media record.
 */
async function seedContent(): Promise<{ article: string; post: string; media: string }> {
    const post = await api.create({ type: 'post', data: { title: 'Post' } });
    const other = await api.create({ type: 'post', data: { title: 'Other' } });
    const mediaId = await createMedia();

    const article = await api.create({
        type: 'article',
        data: {
            title: 'Article',
            fields: {
                author: post.id,
                sections: [
                    { related: [post.id, other.id], gallery: [mediaId] },
                    { related: [other.id] },
                ],
            },
        },
    });
    await usersService.create({
        data: {
            email: 'owner@test.dev',
            name: 'Owner',
            fields: { avatar: mediaId },
        },
    });
    await mediaService.update({ id: mediaId, data: { fields: { credit: post.id } } });

    return { article: article.id, post: post.id, media: mediaId };
}

/** Every stored row, in a stable order, so two runs compare directly. */
async function storedRows(): Promise<RelationshipRow[]> {
    const rows = await relationshipRepository.findMany();
    return rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** One entry's `author` references, ordered by target so two runs compare directly. */
async function authorReferences(
    entryId: string
): Promise<{ targetId: string; sourceStaged: boolean }[]> {
    const rows = await relationshipRepository.findBySource(entryId, 'entry');
    return rows
        .filter((row) => row.schemaPath === 'author')
        .map((row) => ({ targetId: row.targetId, sourceStaged: row.sourceStaged }))
        .sort((a, b) => a.targetId.localeCompare(b.targetId));
}

function driftCount(report: {
    missing: unknown[];
    unexpected: unknown[];
    mismatched: unknown[];
}): number {
    return report.missing.length + report.unexpected.length + report.mismatched.length;
}

describe('checkRelationshipIndex', () => {
    it('reports no drift for content written through the service write paths', async () => {
        await seedContent();

        const report = await checkRelationshipIndex();

        expect(driftCount(report)).toBe(0);
        // Guard against a vacuous pass: every source kind must actually have
        // contributed rows for the parity to mean anything.
        const rows = await storedRows();
        expect(
            [...new Set(rows.map((row) => row.sourceType ?? row.sourceKind))].sort()
        ).toEqual(['article', 'media', 'user']);
        expect(
            rows.filter((row) => row.schemaPath === 'sections[].related')
        ).toHaveLength(3);
        expect(rows.filter((row) => row.targetKind === 'media')).toHaveLength(2);
    });

    // A staged row shares its entry's id, so both content rows are one source
    // and `sourceStaged` is decided reference by reference: canonical when any
    // canonical row carries it, staged when only the staged row does.
    it('derives a shared reference as canonical and a staged-only one as staged', async () => {
        const { article, post } = await seedContent();
        const third = await api.create({ type: 'post', data: { title: 'Third' } });
        await api.createStaged({ type: 'article', id: article });

        // The staged copy starts identical, so nothing is staged-only yet.
        const copied = await relationshipRepository.findBySource(article, 'entry');
        expect(copied.length).toBeGreaterThan(0);
        expect(copied.some((row) => row.sourceStaged)).toBe(false);
        expect(driftCount(await checkRelationshipIndex())).toBe(0);

        // Point the staged change at a different author. The canonical row still
        // holds the original, so one reference is canonical and one is staged-only.
        await api.update({
            type: 'article',
            id: article,
            staged: true,
            data: { fields: { author: third.id } },
        });

        const authors = await authorReferences(article);
        expect(authors).toEqual([
            { targetId: post, sourceStaged: false },
            { targetId: third.id, sourceStaged: true },
        ]);
        expect(driftCount(await checkRelationshipIndex())).toBe(0);

        // The point of the flag: a reverse lookup for display skips the staged
        // reference, a delete check counts it.
        expect(await relationshipRepository.findByTarget(third.id, 'entry')).toEqual([]);
        expect(
            await relationshipRepository.findByTarget(third.id, 'entry', {
                includeStaged: true,
            })
        ).toHaveLength(1);
    });

    it('drops a staged-only reference again when the staged change is discarded', async () => {
        const { article, post } = await seedContent();
        const third = await api.create({ type: 'post', data: { title: 'Third' } });
        await api.createStaged({ type: 'article', id: article });
        await api.update({
            type: 'article',
            id: article,
            staged: true,
            data: { fields: { author: third.id } },
        });

        await api.deleteStaged({ type: 'article', id: article });

        expect(await authorReferences(article)).toEqual([
            { targetId: post, sourceStaged: false },
        ]);
        expect(driftCount(await checkRelationshipIndex())).toBe(0);
    });

    it('makes a merged staged-only reference canonical', async () => {
        const { article } = await seedContent();
        const third = await api.create({ type: 'post', data: { title: 'Third' } });
        await api.createStaged({ type: 'article', id: article });
        await api.update({
            type: 'article',
            id: article,
            staged: true,
            data: { fields: { author: third.id } },
        });

        await api.mergeStaged({ type: 'article', id: article });

        expect(await authorReferences(article)).toEqual([
            { targetId: third.id, sourceStaged: false },
        ]);
        expect(driftCount(await checkRelationshipIndex())).toBe(0);
    });

    it('reports an empty index as entirely missing', async () => {
        await seedContent();
        await relationshipRepository.deleteMany();

        const report = await checkRelationshipIndex();

        expect(report.missing.length).toBeGreaterThan(0);
        expect(report.unexpected).toEqual([]);
    });
});

describe('rebuildRelationshipIndex', () => {
    it('detects a deleted row as missing and restores it', async () => {
        const { article, post } = await seedContent();
        await createRepository(relationshipsTable).deleteMany({
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
        await createRepository(relationshipsTable).create({
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
        const rows = await relationshipRepository.findMany();
        expect(rows.some((row) => row.targetId === 'ghost')).toBe(false);
    });

    it('removes rows left behind by a source that no longer exists', async () => {
        await seedContent();
        await createRepository(relationshipsTable).create({
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

describe('rebuildRelationshipIndex({ type })', () => {
    it('repairs the named type and leaves other types and user/media rows alone', async () => {
        const { article, post, media } = await seedContent();
        const repository = createRepository(relationshipsTable);

        // Drop an article row (must come back) and plant a bogus row on each of
        // the three scopes a `--type article` run must not touch.
        await repository.deleteMany({
            sourceId: article,
            instancePath: 'author',
            targetId: post,
        });
        await repository.create({
            sourceId: post,
            sourceKind: 'entry',
            sourceType: 'post',
            schemaPath: 'related',
            instancePath: 'related',
            targetId: 'ghost',
            targetKind: 'entry',
            sourceStaged: false,
        });
        await repository.create({
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

        const rows = await relationshipRepository.findMany();
        expect(rows.filter((row) => row.targetId === 'ghost')).toHaveLength(2);
    });
});
