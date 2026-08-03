/**
 * Opportunistic dangling-relation cleanup (spec §6): a reference to a target
 * that no longer exists is dropped the next time its holder is written.
 *
 * The two "kept" cases matter more than the drops. Pruning deletes author data,
 * so a target that merely looks absent — a trashed entry, or a row that lives in
 * its own table rather than in `entries` — must survive.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { entries as api } from '@/entries/service.js';
import { usersApi } from '@/users/service.js';
import { createMediaStorage } from '@/media/storage.js';
import { createUserStorage } from '@/users/storage.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations.js';
import { tableStorage } from '@/entries/storage/table.js';
import { defineTable } from '@/database/define-table.js';
import type { StorageDb } from '@/entries/storage/types.js';
import type {
    AstromechConfig,
    Entry,
    FieldDefinition,
    JsonObject,
    PluginDefinition,
} from '@/types/index.js';

const linksTable = defineTable('test_links', ({ col }) => ({
    id: col.id(),
    label: col.text({ notNull: true }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

/** A table-backed entry type: its rows never appear in the `entries` table. */
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
                fields: [{ name: 'label', type: 'text', label: 'Label' }],
            },
        ],
    };
}

/** One relation per target kind, plus one nested inside a repeater. */
const docFields: FieldDefinition[] = [
    { name: 'plain', type: 'text', label: 'Plain' },
    { name: 'author', type: 'relationship', label: 'Author', target: 'post' },
    {
        name: 'related',
        type: 'relationship',
        label: 'Related',
        target: 'post',
        multiple: true,
    },
    { name: 'avatar', type: 'media', label: 'Avatar' },
    { name: 'owner', type: 'relationship', label: 'Owner', target: 'users' },
    { name: 'link', type: 'relationship', label: 'Link', target: 'links/link' },
    { name: 'ghost', type: 'relationship', label: 'Ghost', target: 'not-a-type' },
    {
        name: 'sections',
        type: 'repeater',
        label: 'Sections',
        fields: [{ name: 'ref', type: 'relationship', label: 'Ref', target: 'post' }],
    },
];

function makeDanglingConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            doc: { single: 'Doc', plural: 'Docs', trash: true, fields: docFields },
        },
        plugins: [linksPlugin()],
    };
}

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(makeDanglingConfig());
    await sql`CREATE TABLE test_links (
            id text PRIMARY KEY,
            label text NOT NULL,
            created_at text NOT NULL,
            updated_at text NOT NULL
        )`.execute(db);
});

/** Re-save `doc` touching only a scalar, so the prune runs over stored data. */
async function touch(id: string): Promise<Entry> {
    return (await api.update({
        type: 'doc',
        id,
        data: { fields: { plain: 'touched' } },
    })) as Entry;
}

/** A media row, inserted through storage so no driver or real bytes are needed. */
async function createMedia(): Promise<string> {
    const row = await createMediaStorage().create({
        filename: 'a.png',
        mimeType: 'image/png',
        size: 1,
    });
    return row.id;
}

describe('pruneDanglingRelations (through the entry write path)', () => {
    it('drops a reference to a deleted entry, and the index row with it', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const doc = await api.create({
            type: 'doc',
            title: 'Doc',
            fields: { author: target.id },
        });
        expect(
            await createRelationshipStorage().findBySource(doc.id, 'entry')
        ).toHaveLength(1);

        await api.delete({ type: 'post', id: target.id });
        const updated = await touch(doc.id);

        expect(updated.fields.author).toBeNull();
        expect(await createRelationshipStorage().findBySource(doc.id, 'entry')).toEqual(
            []
        );
    });

    it('drops only the dead id from a multi-relation and keeps the order of the rest', async () => {
        const first = await api.create({ type: 'post', title: 'First' });
        const dead = await api.create({ type: 'post', title: 'Dead' });
        const last = await api.create({ type: 'post', title: 'Last' });
        const doc = await api.create({
            type: 'doc',
            title: 'Doc',
            fields: { related: [first.id, dead.id, last.id] },
        });

        await api.delete({ type: 'post', id: dead.id });
        const updated = await touch(doc.id);

        expect(updated.fields.related).toEqual([first.id, last.id]);
    });

    it('keeps a reference to a TRASHED entry — trashing is not deletion', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const doc = await api.create({
            type: 'doc',
            title: 'Doc',
            fields: { author: target.id },
        });

        await api.trash({ type: 'post', id: target.id });
        const updated = await touch(doc.id);

        expect(updated.fields.author).toBe(target.id);
    });

    // The false-negative guard. `links/link` rows live in `test_links`, so an
    // existence check against `entries` reports every one of them absent: without
    // the `hasEntryStorageOverride` skip this id would be silently deleted.
    it('keeps a reference to a tableStorage-backed entry type', async () => {
        const link = await api.create({ type: 'links/link', fields: { label: 'One' } });
        const doc = await api.create({
            type: 'doc',
            title: 'Doc',
            fields: { link: link.id },
        });

        const updated = await touch(doc.id);

        expect(updated.fields.link).toBe(link.id);
        expect(await api.get({ type: 'links/link', id: link.id })).not.toBeNull();
    });

    // A plugin dropped from the config takes its entry types with it, and its
    // rows may sit in a table this check never reads. Unlocatable is not dead.
    it('keeps a reference whose target names no configured entry type', async () => {
        const doc = await api.create({
            type: 'doc',
            title: 'Doc',
            fields: { ghost: '01JQZZZZZZZZZZZZZZZZZZZZZZ' },
        });

        const updated = await touch(doc.id);

        expect(updated.fields.ghost).toBe('01JQZZZZZZZZZZZZZZZZZZZZZZ');
    });

    it('drops a dead media id and a dead user id', async () => {
        const mediaId = await createMedia();
        const user = await usersApi.create({ email: 'gone@test.dev', name: 'Gone' });
        const doc = await api.create({
            type: 'doc',
            title: 'Doc',
            fields: { avatar: mediaId, owner: user.id },
        });

        await createMediaStorage().delete(mediaId);
        await createUserStorage().delete(user.id);
        const updated = await touch(doc.id);

        expect(updated.fields.avatar).toBeNull();
        expect(updated.fields.owner).toBeNull();
    });

    it('prunes a relation nested in a repeater at its nested path', async () => {
        const alive = await api.create({ type: 'post', title: 'Alive' });
        const dead = await api.create({ type: 'post', title: 'Dead' });
        const doc = await api.create({
            type: 'doc',
            title: 'Doc',
            fields: { sections: [{ ref: dead.id }, { ref: alive.id }] },
        });

        await api.delete({ type: 'post', id: dead.id });
        const updated = await touch(doc.id);

        const sections = updated.fields.sections as { ref: string | null }[];
        expect(sections.map((section) => section.ref)).toEqual([null, alive.id]);
        const rows = await createRelationshipStorage().findBySource(doc.id, 'entry');
        expect(rows.map((row) => row.targetId)).toEqual([alive.id]);
    });
});

describe('pruneDanglingRelations (directly)', () => {
    // The db handle explodes on use, so any existence query fails the test.
    const explodingDb = {
        selectFrom(): never {
            throw new Error('existence query should not run');
        },
    } as unknown as StorageDb;

    it('leaves values holding no relation untouched, and runs no query', async () => {
        const values: JsonObject = { plain: 'nothing to prune' };

        const result = await pruneDanglingRelations(docFields, values, explodingDb);

        expect(result).toEqual({ values, dropped: 0 });
        expect(result.values).toBe(values);
    });

    it('reports how many ids it dropped', async () => {
        const alive = await api.create({ type: 'post', title: 'Alive' });

        const result = await pruneDanglingRelations(docFields, {
            author: 'no-such-entry',
            related: [alive.id, 'also-gone'],
        });

        expect(result.dropped).toBe(2);
        expect(result.values).toEqual({ author: null, related: [alive.id] });
    });
});
