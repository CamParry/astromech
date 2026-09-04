/**
 * Service-level tests for forward versioning (staged entries):
 * createStaged / getStaged / mergeStaged / deleteStaged.
 *
 * Staging is exercised on `post` (versioning ON, relationship field) and `note`
 * (versioning OFF) so the conditional backup branch is covered both ways.
 *
 * Repository-level concerns (partial slug index, list exclusion) are pinned in
 * tests/entries/repository/entries-table.test.ts. These tests own the service policy:
 * content/relation copy, the StagedEntryExistsError gate, merge ordering, and
 * the capability assertions. The staging methods live on the concrete service
 * object (EntriesService & EntriesStagingApi), so we import it directly rather than
 * through the EntriesService-typed local transport.
 */

import type { JsonObject } from '@/types/index';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/database/registry';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { CapabilityError, StagedEntryExistsError } from '@/entries/errors';
import { getEntryRepository } from '@/entries/repository/registry';
import { entriesService as api } from '@/entries/service';

let dbCounter = 0;
let dbPath = '';

beforeEach(async () => {
    // `mergeStaged` runs inside a database transaction. On the harness's plain
    // `:memory:` db a transaction poisons the base connection (post-commit reads
    // throw "no such table"), so use a per-test temp FILE db here: transactions
    // commit to disk and the base connection can read the result back.
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-staging-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);

    const cfg = makeTestConfig();
    // post: versioning on + relationship field; note: versioning off.
    if (cfg.entries.post) cfg.entries.post.staging = true;
    if (cfg.entries.note) cfg.entries.note.staging = true;
    setupTestConfig(cfg);
});

afterEach(() => {
    for (const suffix of ['', '-wal', '-shm']) {
        try {
            rmSync(`${dbPath}${suffix}`);
        } catch {
            // best-effort cleanup
        }
    }
});

function relationTargets(entryId: string): Promise<string[]> {
    return createRelationshipRepository(getDb())
        .findBySource(entryId, 'entry')
        .then((rels) => rels.map((r) => r.targetId).sort());
}

/** `sourceStaged` on every index row for a source (a boolean per row). */
function relationStagedFlags(entryId: string): Promise<boolean[]> {
    return createRelationshipRepository(getDb())
        .findBySource(entryId, 'entry')
        .then((rels) => rels.map((r) => r.sourceStaged));
}

describe('createStaged', () => {
    it('copies content + relations into a fresh, unpublished, linked row', async () => {
        const target = await api.create({
            type: 'post',
            data: { title: 'Target', slug: 'target' },
        });
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { body: 'orig', related: [target.id] },
                status: 'published',
            },
        });

        const staged = await api.createStaged({ type: 'post', id: canonical.id });

        // Same entry, second content row: the id is the entry's throughout.
        expect(staged.id).toBe(canonical.id);
        expect(staged.staged).toBe(true);
        expect(staged.locale).toBe(canonical.locale);
        expect(staged.status).toBe('unpublished');
        expect(staged.publishedAt).toBeNull();
        expect(staged.title).toBe('Live');
        expect(staged.fields.body).toBe('orig');
        // Shares the canonical slug (allowed by the partial unique index).
        expect(staged.slug).toBe('live');
        // The entry's edges are unchanged: both rows hold the same reference.
        expect(await relationTargets(canonical.id)).toEqual([target.id]);
        expect(await relationStagedFlags(canonical.id)).toEqual([false]);
    });

    it('throws StagedEntryExistsError (carrying the locale) when one exists', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'X', slug: 'x' },
        });
        const first = await api.createStaged({ type: 'post', id: canonical.id });
        expect(first.id).toBe(canonical.id);

        await expect(
            api.createStaged({ type: 'post', id: canonical.id })
        ).rejects.toBeInstanceOf(StagedEntryExistsError);

        try {
            await api.createStaged({ type: 'post', id: canonical.id });
            throw new Error('expected throw');
        } catch (err) {
            expect(err).toBeInstanceOf(StagedEntryExistsError);
            expect((err as StagedEntryExistsError).locale).toBe('en');
            expect(err).not.toHaveProperty('stagedId');
        }
    });

    it('throws CapabilityError when the type does not support staging', async () => {
        const card = await api.create({ type: 'card', data: { fields: { label: 'c' } } });
        await expect(
            api.createStaged({ type: 'card', id: card.id })
        ).rejects.toBeInstanceOf(CapabilityError);
    });
});

describe('getStaged', () => {
    it('returns null when the canonical has no staged change', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'X', slug: 'x' },
        });
        expect(await api.getStaged({ type: 'post', id: canonical.id })).toBeNull();
    });

    it('returns the staged change when present', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'X', slug: 'x' },
        });
        const staged = await api.createStaged({ type: 'post', id: canonical.id });
        const got = await api.getStaged({ type: 'post', id: canonical.id });
        expect(got?.id).toBe(staged.id);
        expect(got?.staged).toBe(true);
        expect(got?.title).toBe(canonical.title);
    });
});

describe('mergeStaged', () => {
    it('merges staged content + relations into the canonical, preserving id/slug/status', async () => {
        const target = await api.create({
            type: 'post',
            data: { title: 'T', slug: 't' },
        });
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Orig',
                slug: 'orig',
                fields: { body: 'v1' },
                status: 'published',
            },
        });
        await api.createStaged({ type: 'post', id: canonical.id });
        await api.update({
            type: 'post',
            id: canonical.id,
            staged: true,
            data: { title: 'Updated', fields: { body: 'v2', related: [target.id] } },
        });

        const merged = await api.mergeStaged({ type: 'post', id: canonical.id });

        expect(merged.id).toBe(canonical.id); // id preserved → external refs stable
        expect(merged.title).toBe('Updated');
        expect(merged.fields.body).toBe('v2');
        expect(merged.slug).toBe('orig'); // slug NOT copied
        expect(merged.status).toBe('published'); // status preserved, not forced

        // The staged row is gone and the canonical carries its relations.
        expect(await api.getStaged({ type: 'post', id: canonical.id })).toBeNull();
        expect(await relationTargets(canonical.id)).toEqual([target.id]);
        expect(await relationStagedFlags(canonical.id)).toEqual([false]);
    });

    it('leaves an unpublished canonical unpublished (merge is content-only)', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'Draft work', slug: 'draft-work', fields: { body: 'v1' } },
        });
        expect(canonical.status).toBe('unpublished');
        await api.createStaged({ type: 'post', id: canonical.id });
        await api.update({
            type: 'post',
            id: canonical.id,
            staged: true,
            data: { fields: { body: 'v2' } },
        });

        const merged = await api.mergeStaged({ type: 'post', id: canonical.id });

        expect(merged.fields.body).toBe('v2'); // content merged
        expect(merged.status).toBe('unpublished'); // …but still not published
        expect(merged.publishedAt).toBeNull();
    });

    it('snapshots a backup version of the canonical when versioning is on', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'Orig', slug: 'orig', fields: { body: 'v1' } },
        });
        await api.createStaged({ type: 'post', id: canonical.id });
        await api.update({
            type: 'post',
            id: canonical.id,
            staged: true,
            data: { fields: { body: 'v2' } },
        });

        await api.mergeStaged({ type: 'post', id: canonical.id });

        const versions = await api.versions({ type: 'post', id: canonical.id });
        expect(versions).toHaveLength(1);
        expect(versions[0]?.fields?.body).toBe('v1'); // the pre-merge canonical
    });

    it('merges without a backup version when versioning is off (note)', async () => {
        const canonical = await api.create({
            type: 'note',
            data: { title: 'N', slug: 'n', fields: { body: 'a' } },
        });
        await api.createStaged({ type: 'note', id: canonical.id });
        await api.update({
            type: 'note',
            id: canonical.id,
            staged: true,
            data: { fields: { body: 'b' } },
        });

        const merged = await api.mergeStaged({ type: 'note', id: canonical.id });
        expect(merged.fields.body).toBe('b');
        expect(await api.versions({ type: 'note', id: canonical.id })).toEqual([]);
    });

    it('throws when there is no staged change to merge', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'X', slug: 'x' },
        });
        await expect(api.mergeStaged({ type: 'post', id: canonical.id })).rejects.toThrow(
            /No staged change/
        );
    });
});

/**
 * Merging is the promotion moment: the staged row itself is unpublished, so
 * editing it validates at the `'save'` stage, and the merge is the first write
 * where the canonical's status decides whether completeness applies.
 *
 * Malformed content can't be planted through `api.update` (correctness runs on
 * every write), so these tests write it straight through the repository — standing in
 * for any path that put content in the row without the pipeline.
 */
describe('mergeStaged — field validation', () => {
    beforeEach(() => {
        const cfg = makeTestConfig();
        cfg.entries['post'] = {
            single: 'Post',
            plural: 'Posts',
            versioning: true,
            staging: true,
            fields: [
                { name: 'headline', type: 'text', label: 'Headline', required: true },
                {
                    name: 'code',
                    type: 'text',
                    label: 'Code',
                    validation: [{ unique: true }],
                },
                { name: 'link', type: 'url', label: 'Link' },
                { name: 'page_slug', type: 'slug', label: 'Page Slug' },
            ],
        };
        setupTestConfig(cfg);
    });

    /** Write to the staged row without going through the field pipeline. */
    async function plantFields(id: string, fields: JsonObject): Promise<void> {
        const staging = getEntryRepository('post').staging;
        if (!staging) throw new Error('post has no staging capability');
        await staging.update({ id }, { fields });
    }

    it('rejects staged content missing a required field when the canonical is published', async () => {
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { headline: 'Hello' },
                status: 'published',
            },
        });
        await api.createStaged({ type: 'post', id: canonical.id });
        await api.update({
            type: 'post',
            id: canonical.id,
            staged: true,
            data: { fields: { headline: '' } },
        });

        await expect(
            api.mergeStaged({ type: 'post', id: canonical.id })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { headline: ['This field is required'] },
        });

        // Canonical untouched: no partial write, no backup version.
        const still = await api.get({ type: 'post', id: canonical.id, full: true });
        expect(still?.fields.headline).toBe('Hello');
        expect(await api.versions({ type: 'post', id: canonical.id })).toEqual([]);
    });

    it('accepts the same incomplete content when the canonical is unpublished', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'Draft', slug: 'draft', fields: { headline: 'Hello' } },
        });
        await api.createStaged({ type: 'post', id: canonical.id });
        await api.update({
            type: 'post',
            id: canonical.id,
            staged: true,
            data: { fields: { headline: '' } },
        });

        const merged = await api.mergeStaged({ type: 'post', id: canonical.id });
        expect(merged.fields.headline).toBe('');
    });

    it('rejects malformed staged content regardless of the canonical status', async () => {
        for (const status of ['published', 'unpublished'] as const) {
            const canonical = await api.create({
                type: 'post',
                data: {
                    title: `C-${status}`,
                    slug: `c-${status}`,
                    fields: { headline: 'Hello' },
                    status,
                },
            });
            await api.createStaged({ type: 'post', id: canonical.id });
            await plantFields(canonical.id, { headline: 'Hello', link: 'not a url' });

            await expect(
                api.mergeStaged({ type: 'post', id: canonical.id })
            ).rejects.toMatchObject({
                name: 'ValidationError',
                fields: { link: ['Must be a valid URL'] },
            });
        }
    });

    it('merges a unique field whose value is unchanged between canonical and staged', async () => {
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { headline: 'Hello', code: 'abc123' },
                status: 'published',
            },
        });
        // The staged row shares the canonical's id, so the scan already
        // ignores it; planted through the repository to stand in for content
        // that reached the row without the field pipeline.
        await api.createStaged({ type: 'post', id: canonical.id });
        await plantFields(canonical.id, { headline: 'Hello again', code: 'abc123' });

        const merged = await api.mergeStaged({ type: 'post', id: canonical.id });
        expect(merged.fields.headline).toBe('Hello again');
        expect(merged.fields.code).toBe('abc123');
    });

    it('still rejects a unique value held by a THIRD entry', async () => {
        await api.create({
            type: 'post',
            data: {
                title: 'Other',
                slug: 'other',
                fields: { headline: 'O', code: 'taken' },
            },
        });
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { headline: 'Hello', code: 'free' },
            },
        });
        await api.createStaged({ type: 'post', id: canonical.id });
        await plantFields(canonical.id, { headline: 'Hello', code: 'taken' });

        await expect(
            api.mergeStaged({ type: 'post', id: canonical.id })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { code: ['Already in use'] },
        });
    });

    it('writes the COERCED staged values onto the canonical', async () => {
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { headline: 'Hello' },
                status: 'published',
            },
        });
        await api.createStaged({ type: 'post', id: canonical.id });
        await plantFields(canonical.id, {
            headline: 'Hello',
            link: '  https://example.com/  ',
            page_slug: 'my-page',
        });

        const merged = await api.mergeStaged({ type: 'post', id: canonical.id });
        expect(merged.fields.link).toBe('https://example.com/');
        expect(merged.fields.page_slug).toBe('my-page');
    });
});

/**
 * A staged row holds a COPY of its canonical's content, so on a `unique` field
 * the two rows legitimately hold the same value. Editing either must not
 * collide with the other copy of itself.
 */
describe('update — uniqueness across a canonical and its staged copy', () => {
    beforeEach(() => {
        const cfg = makeTestConfig();
        cfg.entries['post'] = {
            single: 'Post',
            plural: 'Posts',
            staging: true,
            fields: [
                { name: 'headline', type: 'text', label: 'Headline' },
                {
                    name: 'code',
                    type: 'text',
                    label: 'Code',
                    validation: [{ unique: true }],
                },
            ],
        };
        // Same unique field, no staging capability: the gating must not skip
        // the uniqueness check on a type that can't stage.
        cfg.entries['note'] = {
            single: 'Note',
            plural: 'Notes',
            fields: [
                {
                    name: 'code',
                    type: 'text',
                    label: 'Code',
                    validation: [{ unique: true }],
                },
            ],
        };
        setupTestConfig(cfg);
    });

    it('lets the staged row keep the unique value it shares with its canonical', async () => {
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { headline: 'Hello', code: 'abc123' },
                status: 'published',
            },
        });
        await api.createStaged({ type: 'post', id: canonical.id });

        await api.update({
            type: 'post',
            id: canonical.id,
            staged: true,
            data: { fields: { headline: 'Reworded', code: 'abc123' } },
        });

        const after = await api.getStaged({ type: 'post', id: canonical.id });
        expect(after?.fields.headline).toBe('Reworded');
        expect(after?.fields.code).toBe('abc123');
    });

    it('lets the canonical keep its own unique value while a staged copy exists', async () => {
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { headline: 'Hello', code: 'abc123' },
                status: 'published',
            },
        });
        await api.createStaged({ type: 'post', id: canonical.id });

        await api.update({
            type: 'post',
            id: canonical.id,
            data: { fields: { headline: 'Edited', code: 'abc123' } },
        });

        const after = await api.get({ type: 'post', id: canonical.id, full: true });
        expect(after?.fields.headline).toBe('Edited');
        expect(after?.fields.code).toBe('abc123');
    });

    it('still rejects a unique value held by a THIRD entry, from either row', async () => {
        await api.create({
            type: 'post',
            data: {
                title: 'Other',
                slug: 'other',
                fields: { headline: 'O', code: 'taken' },
            },
        });
        const canonical = await api.create({
            type: 'post',
            data: {
                title: 'Live',
                slug: 'live',
                fields: { headline: 'Hello', code: 'free' },
            },
        });
        await api.createStaged({ type: 'post', id: canonical.id });

        await expect(
            api.update({
                type: 'post',
                id: canonical.id,
                staged: true,
                data: { fields: { code: 'taken' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { code: ['Already in use'] },
        });

        await expect(
            api.update({
                type: 'post',
                id: canonical.id,
                data: { fields: { code: 'taken' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { code: ['Already in use'] },
        });
    });

    it('still rejects a duplicate on a type without the staging capability', async () => {
        await api.create({
            type: 'note',
            data: { title: 'A', slug: 'a', fields: { code: 'taken' } },
        });
        const other = await api.create({
            type: 'note',
            data: { title: 'B', slug: 'b', fields: { code: 'free' } },
        });

        await expect(
            api.update({
                type: 'note',
                id: other.id,
                data: { fields: { code: 'taken' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { code: ['Already in use'] },
        });
    });
});

describe('deleteStaged', () => {
    it('hard-deletes the staged change and leaves the canonical untouched', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'Live', slug: 'live', status: 'published' },
        });
        await api.createStaged({ type: 'post', id: canonical.id });

        await api.deleteStaged({ type: 'post', id: canonical.id });

        expect(await api.getStaged({ type: 'post', id: canonical.id })).toBeNull();
        const still = await api.get({ type: 'post', id: canonical.id, full: true });
        expect(still?.title).toBe('Live');
        expect(still?.status).toBe('published');
    });

    it('throws when there is no staged change to delete', async () => {
        const canonical = await api.create({
            type: 'post',
            data: { title: 'X', slug: 'x' },
        });
        await expect(
            api.deleteStaged({ type: 'post', id: canonical.id })
        ).rejects.toThrow(/No staged change/);
    });
});
