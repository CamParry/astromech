/**
 * Opportunistic dangling-relation cleanup: a reference to a target that no
 * longer exists is dropped the next time its holder is written. The "kept" cases
 * matter more than the drops: a target that merely looks absent must survive.
 */

import type {
    AstromechConfig,
    Entry,
    Field,
    JsonObject,
    ResolvedConfig,
} from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { pruneDanglingRelations } from '@/content/dangling-relations';
import { relationshipRepository } from '@/content/repository/relationships';
import { resourceExistenceRepository } from '@/content/repository/resource-existence';
import { setDb } from '@/database/registry';
import { transaction } from '@/database/transaction';
import { mediaRepository } from '@/media/repository';
import { userRepository } from '@/users/repository';

const api = currentServices.entries;
const usersService = currentServices.users;

/** One relation per target kind, plus one nested inside a repeater. */
const docFields: Field[] = [
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
            doc: {
                single: 'Doc',
                plural: 'Docs',
                trash: true,
                staging: true,
                fields: docFields,
            },
        },
    };
}

let config: ResolvedConfig;

beforeEach(async () => {
    await createTestDb();
    config = setupTestConfig(makeDanglingConfig());
});

/** Re-save `doc` touching only a scalar, so the prune runs over stored data. */
async function touch(id: string): Promise<Entry> {
    return (await api.update({
        type: 'doc',
        id,
        data: { fields: { plain: 'touched' } },
    })) as Entry;
}

/** A media row, inserted through the repository so no driver or real bytes are needed. */
async function createMedia(): Promise<string> {
    const row = await mediaRepository.create(
        {
            filename: 'a.png',
            mimeType: 'image/png',
            size: 1,
        },
        {}
    );
    return row.id;
}

describe('pruneDanglingRelations (through the entry write path)', () => {
    it('drops a reference to a deleted entry, and the index row with it', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const doc = await api.create({
            type: 'doc',
            data: { title: 'Doc', fields: { author: target.id } },
        });
        expect(await relationshipRepository.findBySource(doc.id, 'entry')).toHaveLength(
            1
        );

        await api.delete({ type: 'post', id: target.id });
        const updated = await touch(doc.id);

        expect(updated.fields.author).toBeNull();
        expect(await relationshipRepository.findBySource(doc.id, 'entry')).toEqual([]);
    });

    it('drops only the dead id from a multi-relation and keeps the order of the rest', async () => {
        const first = await api.create({ type: 'post', data: { title: 'First' } });
        const dead = await api.create({ type: 'post', data: { title: 'Dead' } });
        const last = await api.create({ type: 'post', data: { title: 'Last' } });
        const doc = await api.create({
            type: 'doc',
            data: { title: 'Doc', fields: { related: [first.id, dead.id, last.id] } },
        });

        await api.delete({ type: 'post', id: dead.id });
        const updated = await touch(doc.id);

        expect(updated.fields.related).toEqual([first.id, last.id]);
    });

    it('keeps a reference to a TRASHED entry — trashing is not deletion', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const doc = await api.create({
            type: 'doc',
            data: { title: 'Doc', fields: { author: target.id } },
        });

        await api.trash({ type: 'post', id: target.id });
        const updated = await touch(doc.id);

        expect(updated.fields.author).toBe(target.id);
    });

    it('drops a dead media id and a dead user id', async () => {
        const mediaId = await createMedia();
        const user = await usersService.create({
            data: { email: 'gone@test.dev', name: 'Gone' },
        });
        const doc = await api.create({
            type: 'doc',
            data: { title: 'Doc', fields: { avatar: mediaId, owner: user.id } },
        });

        await mediaRepository.delete(mediaId);
        await userRepository.delete(user.id);
        const updated = await touch(doc.id);

        expect(updated.fields.avatar).toBeNull();
        expect(updated.fields.owner).toBeNull();
    });

    it('drops a dead reference when a staged change is merged', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const doc = await api.create({
            type: 'doc',
            data: { title: 'Doc', fields: { author: target.id } },
        });
        const staged = await api.createStaged({ type: 'doc', id: doc.id });
        await api.update({
            type: 'doc',
            id: staged.id,
            data: { fields: { plain: 'staged' } },
        });

        await api.delete({ type: 'post', id: target.id });
        const merged = await api.mergeStaged({ type: 'doc', id: doc.id });

        expect(merged.fields.author).toBeNull();
        expect(await relationshipRepository.findBySource(doc.id, 'entry')).toEqual([]);
    });

    it('prunes a relation nested in a repeater at its nested path', async () => {
        const alive = await api.create({ type: 'post', data: { title: 'Alive' } });
        const dead = await api.create({ type: 'post', data: { title: 'Dead' } });
        const doc = await api.create({
            type: 'doc',
            data: {
                title: 'Doc',
                fields: { sections: [{ ref: dead.id }, { ref: alive.id }] },
            },
        });

        await api.delete({ type: 'post', id: dead.id });
        const updated = await touch(doc.id);

        const sections = updated.fields.sections as { ref: string | null }[];
        expect(sections.map((section) => section.ref)).toEqual([null, alive.id]);
        const rows = await relationshipRepository.findBySource(doc.id, 'entry');
        expect(rows.map((row) => row.targetId)).toEqual([alive.id]);
    });
});

describe('pruneDanglingRelations (directly)', () => {
    // The db handle explodes on use, so any existence query fails the test.
    const explodingDb = {
        selectFrom(): never {
            throw new Error('existence query should not run');
        },
    } as unknown as Parameters<typeof setDb>[0];

    it('leaves values holding no relation untouched, and runs no query', async () => {
        const values: JsonObject = { plain: 'nothing to prune' };
        setDb(explodingDb);

        const result = await pruneDanglingRelations(config, docFields, values);

        expect(result).toEqual({ values, dropped: 0 });
        expect(result.values).toBe(values);
    });

    // The existence read joins the open transaction, so a row written earlier in
    // it exists and only the missing id is dropped.
    it('keeps an entry created earlier in the same transaction', async () => {
        const missing = '01JQZZZZZZZZZZZZZZZZZZZZZZ';

        await transaction(async () => {
            const post = await api.create({ type: 'post', data: { title: 'New' } });

            const kept = await pruneDanglingRelations(config, docFields, {
                author: post.id,
            });
            const dropped = await pruneDanglingRelations(config, docFields, {
                author: missing,
            });

            expect(kept).toEqual({ values: { author: post.id }, dropped: 0 });
            expect(dropped).toEqual({ values: { author: null }, dropped: 1 });
        });
    });

    // Boot refuses an entry type naming an unknown target, but the prune also
    // runs over declarations the config never checked. Unlocatable is not dead.
    it('keeps a reference whose target names no configured entry type', async () => {
        const ghost: Field = {
            name: 'ghost',
            type: 'relationship',
            label: 'Ghost',
            target: 'not-a-type',
        };
        const values: JsonObject = { ghost: '01JQZZZZZZZZZZZZZZZZZZZZZZ' };

        const result = await pruneDanglingRelations(config, [ghost], values);

        expect(result).toEqual({ values, dropped: 0 });
    });

    it('reports how many ids it dropped', async () => {
        const alive = await api.create({ type: 'post', data: { title: 'Alive' } });

        const result = await pruneDanglingRelations(config, docFields, {
            author: 'no-such-entry',
            related: [alive.id, 'also-gone'],
        });

        expect(result.dropped).toBe(2);
        expect(result.values).toEqual({ author: null, related: [alive.id] });
    });

    it('asks which ids exist once per target kind', async () => {
        const { findIds } = resourceExistenceRepository;
        const asked: [string, string[]][] = [];
        vi.spyOn(resourceExistenceRepository, 'findIds').mockImplementation(
            (kind, ids) => {
                asked.push([kind, ids]);
                return findIds(kind, ids);
            }
        );
        await pruneDanglingRelations(config, docFields, {
            author: 'gone-1',
            related: ['gone-2', 'gone-3'],
            owner: 'gone-user',
        });

        expect(asked).toEqual([
            ['entry', ['gone-1', 'gone-2', 'gone-3']],
            ['user', ['gone-user']],
        ]);
    });
});
