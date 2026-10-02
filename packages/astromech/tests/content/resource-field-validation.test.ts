/**
 * Every resource runs a write through the same field pipeline: a required field
 * must hold a value, a slug field must already be a slug, a default fills an
 * absent value, and an update merges into the stored fields. Each resource here
 * holds the same fields and has no statuses, so every write must be complete;
 * how entries and globals relax that while unpublished is in their own tests.
 */

import type { Field, JsonObject, ResourceType } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { RESOURCE_TYPES } from '@/types/domain';

const entriesService = currentServices.entries;
const globalsService = currentServices.globals;
const mediaService = currentServices.media;
const usersService = currentServices.users;

/** The fields every resource declares. */
const FIELDS: Field[] = [
    { name: 'headline', type: 'text', label: 'Headline', required: true },
    { name: 'handle', type: 'slug', label: 'Handle' },
    { name: 'badge', type: 'text', label: 'Badge' },
    { name: 'tier', type: 'text', label: 'Tier', defaultValue: 'free' },
];

/** Publishes a config in which every resource declares `fields`. */
function setupFields(fields: Field[]): void {
    const base = makeTestConfig();
    setupTestConfig({
        ...base,
        entries: {
            ...base.entries,
            item: { single: 'Item', plural: 'Items', statuses: false, fields },
        },
        globals: [{ key: 'profile', label: 'Profile', statuses: false, fields }],
        users: { fields },
        media: { fields },
    });
}

/** How the checks reach one resource. `id` is a global's key. */
type Adapter = {
    /** The first write that carries `fields`; answers the resource it saved. */
    save(fields: JsonObject): Promise<{ id: string; fields: JsonObject }>;
    /** A later write of `fields`. */
    update(id: string, fields: JsonObject): Promise<{ fields: JsonObject }>;
    /**
     * A write that names no `fields` key, and the column it sets to what value.
     * A global has no column outside its fields, so it has none.
     */
    updateWithoutFields?: {
        write(id: string): Promise<object>;
        sets: [column: string, value: string];
    };
};

/** Makes each saved user's email unique. */
let users = 0;

const ADAPTERS: Record<ResourceType, Adapter> = {
    entry: {
        save: (fields) =>
            entriesService.create({ type: 'item', data: { title: 'T', fields } }),
        update: (id, fields) =>
            entriesService.update({ type: 'item', id, data: { fields } }),
        updateWithoutFields: {
            write: (id) =>
                entriesService.update({ type: 'item', id, data: { title: 'Retitled' } }),
            sets: ['title', 'Retitled'],
        },
    },
    global: {
        async save(fields) {
            const saved = await globalsService.update({
                key: 'profile',
                data: { fields },
            });
            return { id: saved.key, fields: saved.fields };
        },
        update: (key, fields) => globalsService.update({ key, data: { fields } }),
    },
    user: {
        save: (fields) =>
            usersService.create({
                data: {
                    email: `user${String((users += 1))}@test.dev`,
                    name: 'Ann',
                    fields,
                },
            }),
        update: (id, fields) => usersService.update({ id, data: { fields } }),
        updateWithoutFields: {
            write: (id) => usersService.update({ id, data: { name: 'Annabel' } }),
            sets: ['name', 'Annabel'],
        },
    },
    media: {
        // An upload carries no fields, so the first write of them is an update.
        async save(fields) {
            const file = new File(['hello'], 'doc.txt', { type: 'text/plain' });
            const uploaded = await mediaService.upload({ file });
            return mediaService.update({ id: uploaded.id, data: { fields } });
        },
        update: (id, fields) => mediaService.update({ id, data: { fields } }),
        updateWithoutFields: {
            write: (id) => mediaService.update({ id, data: { alt: 'Described' } }),
            sets: ['alt', 'Described'],
        },
    },
};

beforeEach(async () => {
    await createTestDb();
    setupFields(FIELDS);
});

describe.each(RESOURCE_TYPES)('%s', (kind) => {
    const adapter = ADAPTERS[kind];

    describe('a required field', () => {
        it('is refused when absent', async () => {
            await expect(adapter.save({})).rejects.toMatchObject({
                name: 'ValidationError',
                fields: { headline: ['This field is required'] },
            });
        });

        it('is refused when empty', async () => {
            await expect(adapter.save({ headline: '' })).rejects.toMatchObject({
                name: 'ValidationError',
                fields: { headline: ['This field is required'] },
            });
        });

        it('is refused when an update empties it', async () => {
            const saved = await adapter.save({ headline: 'Hi' });

            await expect(
                adapter.update(saved.id, { headline: '' })
            ).rejects.toMatchObject({
                name: 'ValidationError',
                fields: { headline: ['This field is required'] },
            });
        });
    });

    describe('a slug field', () => {
        it('refuses a value that is not already a slug, suggesting one', async () => {
            await expect(
                adapter.save({ headline: 'Hi', handle: 'Alice Smith' })
            ).rejects.toMatchObject({
                name: 'ValidationError',
                fields: {
                    handle: [
                        "Must be lowercase letters, numbers and hyphens: try 'alice-smith'",
                    ],
                },
            });
        });

        it('stores a value that is already a slug', async () => {
            const saved = await adapter.save({ headline: 'Hi', handle: 'alice-smith' });
            expect(saved.fields['handle']).toBe('alice-smith');
        });

        it('stores a slug an update sets', async () => {
            const saved = await adapter.save({ headline: 'Hi' });

            const updated = await adapter.update(saved.id, {
                headline: 'Updated',
                handle: 'new-handle',
            });

            expect(updated.fields['handle']).toBe('new-handle');
        });
    });

    describe('a default value', () => {
        // Fails on media until an upload runs the field pipeline:
        // `roadmap/planned/media-upload-skips-field-defaults.md`
        const fillsDefault = kind === 'media' ? it.fails : it;
        fillsDefault('fills a field the first write leaves out', async () => {
            const saved = await adapter.save({ headline: 'Hi' });
            expect(saved.fields['tier']).toBe('free');
        });

        it('does not override a value the write gives', async () => {
            const saved = await adapter.save({ headline: 'Hi', tier: 'pro' });
            expect(saved.fields['tier']).toBe('pro');
        });
    });

    it('keeps the fields an update leaves out', async () => {
        const saved = await adapter.save({ headline: 'Hi', badge: 'gold' });

        const updated = await adapter.update(saved.id, { tier: 'pro' });

        expect(updated.fields).toMatchObject({
            headline: 'Hi',
            badge: 'gold',
            tier: 'pro',
        });
    });
});

/** Every resource with a write that names no `fields` key. */
const WITHOUT_FIELDS = RESOURCE_TYPES.flatMap((kind) => {
    const updateWithoutFields = ADAPTERS[kind].updateWithoutFields;
    return updateWithoutFields ? [{ kind, ...updateWithoutFields }] : [];
});

describe.each(WITHOUT_FIELDS)('$kind', ({ kind, write, sets }) => {
    it('writes a column outside its fields without running field validation', async () => {
        // Stores fields that now fail validation: saved while `headline` was
        // optional, then made required, so a write that validated would refuse.
        setupFields(
            FIELDS.map((field) =>
                field.name === 'headline' ? { ...field, required: false } : field
            )
        );
        const saved = await ADAPTERS[kind].save({});
        setupFields(FIELDS);

        const updated = await write(saved.id);

        const [column, value] = sets;
        expect(updated).toHaveProperty(column, value);
    });
});
