/**
 * `entries.incomingRelations` — reverse lookup for the delete modal.
 *
 * The interesting case is a source whose entry type is NOT the target's: it
 * lives in that type's own storage, so loading it through the target's storage
 * finds nothing. `links/link` is table-backed, which makes the two storages
 * genuinely different rather than the same built-in singleton.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { entries as api } from '@/entries/service.js';
import { tableStorage } from '@/entries/storage/table.js';
import { defineTable } from '@/database/define-table.js';
import type { AstromechConfig, PluginDefinition } from '@/types/index.js';

const linksTable = defineTable('test_links', ({ col }) => ({
    id: col.id(),
    label: col.text({ notNull: true }),
    post: col.text(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

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

/** `article` references `post` twice — once flat, once inside a repeater. */
function makeRelationsConfig(): AstromechConfig {
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
                            },
                        ],
                    },
                ],
            },
        },
        plugins: [linksPlugin()],
    };
}

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(makeRelationsConfig());
    await sql`CREATE TABLE test_links (
            id text PRIMARY KEY,
            label text NOT NULL,
            post text,
            created_at text NOT NULL,
            updated_at text NOT NULL
        )`.execute(db);
});

describe('incomingRelations', () => {
    it('returns a source whose entry type is not the target type', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const source = await api.create({
            type: 'article',
            title: 'Article',
            fields: { author: target.id },
        });

        const incoming = await api.incomingRelations({ type: 'post', id: target.id });

        expect(incoming).toEqual([
            {
                sourceId: source.id,
                sourceTitle: 'Article',
                sourceType: 'article',
                schemaPath: 'author',
            },
        ]);
    });

    // The source lives in its own table, so the target's storage cannot see it.
    it('returns a source held in a different storage backend', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const link = await api.create({
            type: 'links/link',
            fields: { label: 'A link', post: target.id },
        });

        const incoming = await api.incomingRelations({ type: 'post', id: target.id });

        expect(incoming).toEqual([
            {
                sourceId: link.id,
                sourceTitle: '',
                sourceType: 'links/link',
                schemaPath: 'post',
            },
        ]);
    });

    it('yields one row per schema path when a source references the target twice', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const source = await api.create({
            type: 'article',
            title: 'Twice',
            fields: { author: target.id, sections: [{ related: target.id }] },
        });

        const incoming = await api.incomingRelations({ type: 'post', id: target.id });

        expect(incoming).toHaveLength(2);
        expect(incoming.every((r) => r.sourceId === source.id)).toBe(true);
        expect(incoming.map((r) => r.schemaPath).sort()).toEqual([
            'author',
            'sections[].related',
        ]);
    });

    // A pending merge referencing the target is a reason not to delete it.
    it('includes a staged source', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const canonical = await api.create({
            type: 'article',
            title: 'Canonical',
            fields: { author: target.id },
        });
        const staged = await api.createStaged({ type: 'article', id: canonical.id });

        const incoming = await api.incomingRelations({ type: 'post', id: target.id });

        expect(incoming.map((r) => r.sourceId).sort()).toEqual(
            [canonical.id, staged.id].sort()
        );
    });

    it('includes a trashed source', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const source = await api.create({
            type: 'article',
            title: 'Trashed',
            fields: { author: target.id },
        });
        await api.trash({ type: 'article', id: source.id });

        const incoming = await api.incomingRelations({ type: 'post', id: target.id });

        expect(incoming.map((r) => r.sourceId)).toEqual([source.id]);
    });

    it('returns an empty list when nothing references the target', async () => {
        const target = await api.create({ type: 'post', title: 'Lonely' });
        expect(await api.incomingRelations({ type: 'post', id: target.id })).toEqual([]);
    });
});
