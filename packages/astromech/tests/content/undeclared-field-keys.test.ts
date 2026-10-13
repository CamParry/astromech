/**
 * A field the config stops declaring keeps its stored values: a save carries
 * the stored row's undeclared root keys over into the row it writes, a full
 * read returns them, a public read never does, and declaring the name again
 * makes them readable. The parse and the validators see only declared fields,
 * so an undeclared key a client sends is not stored.
 * (`decisions/saves-keep-undeclared-field-values.md`)
 */

import type { AstromechConfig, Field, JsonObject } from '@/types/index';
import {
    createTestDb,
    makeTestConfig,
    setupTestConfig,
    withEntryTypes,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { mediaRepository } from '@/media/repository';

const entries = currentServices.entries;

/** The fields before the rename: `headline` is the one that gets renamed. */
const BEFORE: Field[] = [
    { name: 'body', type: 'text', label: 'Body' },
    { name: 'headline', type: 'text', label: 'Headline' },
];

/** The fields after `headline` is renamed to `heading`. */
const AFTER: Field[] = [
    { name: 'body', type: 'text', label: 'Body' },
    { name: 'heading', type: 'text', label: 'Heading' },
];

/** The harness config with `fields` on a staged `post`, a global, users and media. */
function configWith(fields: Field[]): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: withEntryTypes(base.entries, {
            type: 'post',
            single: 'Post',
            plural: 'Posts',
            staging: true,
            fields,
        }),
        globals: [{ key: 'site', label: 'Site', public: true, fields }],
        users: { fields },
        media: { fields },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWith(BEFORE));
});

/** A published post saved with `headline`, then the config renaming it. */
async function postAfterRename(): Promise<string> {
    const post = await entries.create({
        type: 'post',
        data: {
            title: 'Post',
            status: 'published',
            fields: { body: 'v1', headline: 'Old headline' },
        },
    });
    setupTestConfig(configWith(AFTER));
    return post.id;
}

describe('an entry saved after a field is renamed', () => {
    it('keeps the old key’s value in the stored row', async () => {
        const id = await postAfterRename();

        await entries.update({ type: 'post', id, data: { fields: { body: 'v2' } } });

        const full = await entries.get({ type: 'post', id, full: true });
        expect(full?.fields).toEqual({ body: 'v2', headline: 'Old headline' });
    });

    it('never returns the undeclared key from a public read', async () => {
        const id = await postAfterRename();
        await entries.update({ type: 'post', id, data: { fields: { body: 'v2' } } });

        const read = await entries.get({ type: 'post', id });
        expect(read?.fields).toEqual({ body: 'v2' });
    });

    it('returns the value again once the old name is restored', async () => {
        const id = await postAfterRename();
        await entries.update({ type: 'post', id, data: { fields: { body: 'v2' } } });

        setupTestConfig(configWith(BEFORE));

        const read = await entries.get({ type: 'post', id });
        expect(read?.fields).toEqual({ body: 'v2', headline: 'Old headline' });
    });

    it('stores no undeclared key the client sends, even one the row holds', async () => {
        const id = await postAfterRename();

        await entries.update({
            type: 'post',
            id,
            data: { fields: { headline: 'Sent headline', stray: 'sent' } },
        });

        const full = await entries.get({ type: 'post', id, full: true });
        expect(full?.fields).toEqual({ body: 'v1', headline: 'Old headline' });
    });

    it('keeps the old key’s value through a staged change and its merge', async () => {
        const id = await postAfterRename();
        await entries.createStaged({ type: 'post', id });
        await entries.update({
            type: 'post',
            id,
            staged: true,
            data: { fields: { body: 'staged' } },
        });

        const merged = await entries.mergeStaged({ type: 'post', id });

        expect(merged.fields).toEqual({ body: 'staged', headline: 'Old headline' });
    });
});

/** How each other resource saves `fields` and reads them back in full. */
const OTHER_RESOURCES = {
    global: {
        async create(fields: JsonObject) {
            await currentServices.globals.update({ key: 'site', data: { fields } });
            return 'site';
        },
        save: (_id: string, fields: JsonObject) =>
            currentServices.globals.update({ key: 'site', data: { fields } }),
        read: async (_id: string) =>
            (await currentServices.globals.get({ key: 'site', full: true }))?.fields,
    },
    user: {
        async create(fields: JsonObject) {
            const user = await currentServices.users.create({
                data: { email: 'ann@test.dev', name: 'Ann', fields },
            });
            return user.id;
        },
        save: (id: string, fields: JsonObject) =>
            currentServices.users.update({ id, data: { fields } }),
        read: async (id: string) => (await currentServices.users.get({ id }))?.fields,
    },
    media: {
        async create(fields: JsonObject) {
            const row = await mediaRepository.create(
                { filename: 'photo.png', mimeType: 'image/png', size: 1 },
                {}
            );
            await currentServices.media.update({ id: row.id, data: { fields } });
            return row.id;
        },
        save: (id: string, fields: JsonObject) =>
            currentServices.media.update({ id, data: { fields } }),
        read: async (id: string) => (await currentServices.media.get({ id }))?.fields,
    },
};

describe.each(Object.entries(OTHER_RESOURCES))(
    'a %s saved after a field is renamed',
    (_kind, resource) => {
        it('keeps the old key’s value and stores none the client sends', async () => {
            const id = await resource.create({ body: 'v1', headline: 'Old headline' });
            setupTestConfig(configWith(AFTER));

            await resource.save(id, { body: 'v2', stray: 'sent' });

            expect(await resource.read(id)).toEqual({
                body: 'v2',
                headline: 'Old headline',
            });
        });
    }
);
