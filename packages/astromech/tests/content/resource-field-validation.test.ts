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

/** How the checks reach one resource. `id` is a global's key. */
type Adapter = {
    /** The first write that carries `fields`; answers the resource it saved. */
    save(fields: JsonObject): Promise<{ id: string; fields: JsonObject }>;
    /**
     * What the default fills `tier` with on the first write that leaves it out.
     * An upload stores no fields and skips the pipeline, and the first write of
     * them is an update, so a media item's defaults are never filled.
     */
    defaultFilled: string | undefined;
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
        defaultFilled: 'free',
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
        defaultFilled: 'free',
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
        defaultFilled: 'free',
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
        defaultFilled: undefined,
        update: (id, fields) => mediaService.update({ id, data: { fields } }),
        updateWithoutFields: {
            write: (id) => mediaService.update({ id, data: { alt: 'Described' } }),
            sets: ['alt', 'Described'],
        },
    },
};

beforeEach(async () => {
    await createTestDb();
    const base = makeTestConfig();
    setupTestConfig({
        ...base,
        entries: {
            ...base.entries,
            item: { single: 'Item', plural: 'Items', statuses: false, fields: FIELDS },
        },
        globals: [{ key: 'profile', label: 'Profile', statuses: false, fields: FIELDS }],
        users: { fields: FIELDS },
        media: { fields: FIELDS },
    });
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
        it('fills a field the first write leaves out, except on media', async () => {
            const saved = await adapter.save({ headline: 'Hi' });
            expect(saved.fields['tier']).toBe(adapter.defaultFilled);
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

describe.each(RESOURCE_TYPES.filter((kind) => ADAPTERS[kind].updateWithoutFields))(
    '%s',
    (kind) => {
        const { write, sets } = ADAPTERS[kind].updateWithoutFields ?? {};

        it('writes a column outside its fields without running field validation', async () => {
            const saved = await ADAPTERS[kind].save({ headline: 'Hi' });

            const updated = await write?.(saved.id);

            expect(updated).toHaveProperty(sets?.[0] ?? '', sets?.[1]);
        });
    }
);
