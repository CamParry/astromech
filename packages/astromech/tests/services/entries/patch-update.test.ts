/**
 * Integration tests for PATCH semantics on `entries.update`.
 *
 * `fields` is merged onto the stored document at the root level: an omitted
 * field keeps its value, `null` stores null, containers replace wholesale, and
 * validation runs against the merged result.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { Astromech } from '@/transport/local/index';
import type { AstromechConfig, Entry, JsonObject } from '@/types/index';

const api = Astromech.entries;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * `page_slug` is typed by the caller so a test can create data under one schema
 * and update it under another — the drift that makes re-coercion observable.
 */
function makePatchConfig(pageSlugType: 'text' | 'slug' = 'slug'): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            post: {
                single: 'Post',
                plural: 'Posts',
                versioning: true,
                fields: [
                    { name: 'body', type: 'text', label: 'Body' },
                    {
                        name: 'headline',
                        type: 'text',
                        label: 'Headline',
                        required: true,
                    },
                    { name: 'secret', type: 'text', label: 'Secret', private: true },
                    { name: 'note', type: 'text', label: 'Note' },
                    { name: 'contact_email', type: 'email', label: 'Email' },
                    { name: 'page_slug', type: pageSlugType, label: 'Page Slug' },
                    {
                        name: 'items',
                        type: 'repeater',
                        label: 'Items',
                        fields: [{ name: 'label', type: 'text', label: 'Label' }],
                    },
                    {
                        name: 'summary',
                        type: 'text',
                        label: 'Summary',
                        validation: [
                            {
                                custom: async (ctx) =>
                                    ctx.values['headline'] === 'Approved'
                                        ? true
                                        : 'Needs an approved headline',
                            },
                        ],
                    },
                ],
            },
            // No field definitions: the schema is unknown here, so nothing may
            // be projected away.
            blank: {
                single: 'Blank',
                plural: 'Blanks',
                fields: [],
            },
        },
    };
}

/** `update` returns `Entry | Entry[]`; every call here passes one id. */
function one(result: Entry | Entry[]): Entry {
    return Array.isArray(result) ? result[0]! : result;
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makePatchConfig());
});

// ---------------------------------------------------------------------------
// Merge basics
// ---------------------------------------------------------------------------

describe('update — root-level merge', () => {
    it('keeps fields the patch omits', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { headline: 'H', body: 'B', note: 'N' },
        });

        const updated = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { body: 'B2' } },
            })
        );

        expect(updated.fields).toMatchObject({ headline: 'H', body: 'B2', note: 'N' });
    });

    it('stores an explicit null rather than treating it as a delete', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { headline: 'H', note: 'N' },
        });

        const updated = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { note: null } },
            })
        );

        expect(updated.fields).toHaveProperty('note', null);
        expect(updated.fields.headline).toBe('H');
    });

    it('replaces a repeater array wholesale', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: {
                headline: 'H',
                items: [
                    { _id: 'a1', label: 'one' },
                    { _id: 'a2', label: 'two' },
                ],
            },
        });

        const updated = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { items: [{ _id: 'a2', label: 'two' }] } },
            })
        );

        expect(updated.fields.items).toEqual([{ _id: 'a2', label: 'two' }]);
    });
});

// ---------------------------------------------------------------------------
// The AI write-back regression
// ---------------------------------------------------------------------------

describe('update — public-shape write-back', () => {
    it('keeps a private field the public read stripped', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            status: 'published',
            fields: { headline: 'H', body: 'B', secret: 'classified' },
        });

        // A public read: `secret` is projected away, and the brand that guards
        // direct write-back does not survive the wire.
        const publicRead = await api.get({ type: 'post', id: entry.id });
        expect(publicRead?.fields).not.toHaveProperty('secret');
        const overTheWire = JSON.parse(JSON.stringify(publicRead?.fields)) as JsonObject;

        const updated = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { ...overTheWire, body: 'B2' } },
            })
        );

        expect(updated.fields.secret).toBe('classified');
        expect(updated.fields.body).toBe('B2');
    });
});

// ---------------------------------------------------------------------------
// Coercion scoping
// ---------------------------------------------------------------------------

describe('update — coercion is scoped to the patch', () => {
    it('leaves an untouched field uncoerced when the schema has drifted', async () => {
        // Stored while `page_slug` was a plain text field, so the value is not
        // in slug form.
        setupTestConfig(makePatchConfig('text'));
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { headline: 'H', page_slug: 'My Page Title' },
        });

        setupTestConfig(makePatchConfig('slug'));
        const untouched = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { body: 'B' } },
            })
        );
        expect(untouched.fields.page_slug).toBe('My Page Title');

        // Naming it in the patch coerces it, as on any other write.
        const touched = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { page_slug: 'My Page Title' } },
            })
        );
        expect(touched.fields.page_slug).toBe('my-page-title');
    });
});

// ---------------------------------------------------------------------------
// Validation against the merged document
// ---------------------------------------------------------------------------

describe('update — validation sees the merged document', () => {
    it('a required field absent from the patch does not block a publish', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            status: 'published',
            fields: { headline: 'H' },
        });

        const updated = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { body: 'B' } },
            })
        );

        expect(updated.fields.headline).toBe('H');
        expect(updated.fields.body).toBe('B');
    });

    it('rejects a patch that makes the merged document invalid', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { headline: 'H' },
        });

        await expect(
            api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { contact_email: 'not-an-email' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { contact_email: ['Must be a valid email address'] },
        });
    });

    it('a cross-field rule reads merged siblings, not just the patch', async () => {
        const approved = await api.create({
            type: 'post',
            title: 'A',
            fields: { headline: 'Approved' },
        });
        const updated = one(
            await api.update({
                type: 'post',
                id: approved.id,
                data: { fields: { summary: 'S' } },
            })
        );
        expect(updated.fields.summary).toBe('S');

        const pending = await api.create({
            type: 'post',
            title: 'B',
            fields: { headline: 'Draft' },
        });
        await expect(
            api.update({
                type: 'post',
                id: pending.id,
                data: { fields: { summary: 'S' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { summary: ['Needs an approved headline'] },
        });
    });
});

// ---------------------------------------------------------------------------
// Schema projection
// ---------------------------------------------------------------------------

describe('update — projection to the schema', () => {
    it('drops a key no field definition claims', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { headline: 'H', legacy: 'left over' },
        });
        // The create write drops it too — the pipeline projects to the schema.
        expect(entry.fields).not.toHaveProperty('legacy');

        const updated = one(
            await api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { body: 'B' } },
            })
        );

        expect(updated.fields).not.toHaveProperty('legacy');
        expect(updated.fields.headline).toBe('H');
    });

    it('drops nothing when the type declares no fields', async () => {
        const entry = await api.create({
            type: 'blank',
            title: 'T',
            fields: { anything: 'kept' },
        });

        const updated = one(
            await api.update({
                type: 'blank',
                id: entry.id,
                data: { fields: { other: 'also kept' } },
            })
        );

        expect(updated.fields).toEqual({ anything: 'kept', other: 'also kept' });
    });
});

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

describe('update — version snapshots', () => {
    it('creates no version when the patch changes nothing', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { headline: 'H', body: 'B' },
        });

        await api.update({ type: 'post', id: entry.id, data: { fields: { body: 'B' } } });

        expect(await api.versions({ type: 'post', id: entry.id })).toHaveLength(0);
    });

    it('creates exactly one version when the patch changes a field', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { headline: 'H', body: 'B' },
        });

        await api.update({
            type: 'post',
            id: entry.id,
            data: { fields: { body: 'B2' } },
        });

        const versions = await api.versions({ type: 'post', id: entry.id });
        expect(versions).toHaveLength(1);
        expect((versions[0]?.fields as JsonObject).body).toBe('B');
    });
});
