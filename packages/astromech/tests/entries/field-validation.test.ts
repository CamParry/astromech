/**
 * The field pipeline as entries add to it: completeness follows the status the
 * row will hold, an email field is checked, and a refused update writes no
 * version. The rules every resource shares are in
 * `tests/content/resource-field-validation.test.ts`.
 */

import type { AstromechConfig } from '@/types/index';
import {
    createTestDb,
    makeTestConfig,
    setupTestConfig,
    withEntryTypes,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';

const entriesService = currentServices.entries;

const api = entriesService;

function makeValidationConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: withEntryTypes(base.entries, {
            type: 'post',
            single: 'Post',
            plural: 'Posts',
            versioning: true,
            translatable: true,
            fields: [
                // Required text field
                {
                    name: 'title_text',
                    type: 'text',
                    label: 'Title Text',
                    required: true,
                },
                // Email field (descriptor-level validate)
                { name: 'contact_email', type: 'email', label: 'Contact Email' },
                { name: 'code', type: 'text', label: 'Code' },
                // Text field with defaultValue
                {
                    name: 'status_label',
                    type: 'text',
                    label: 'Status Label',
                    defaultValue: 'pending',
                },
                // Slug field (coerces to slugified string)
                { name: 'page_slug', type: 'slug', label: 'Page Slug' },
            ],
        }),
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeValidationConfig());
});

describe('create — required field', () => {
    it('rejects when required field is absent', async () => {
        await expect(
            api.create({
                type: 'post',
                data: { title: 'T', status: 'published', fields: {} },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });

    it('rejects when required field is empty string', async () => {
        await expect(
            api.create({
                type: 'post',
                data: { title: 'T', status: 'published', fields: { title_text: '' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });
});

describe('validation stage — derived from the status the row will hold', () => {
    it('an unpublished create with a missing required field succeeds', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Draft', status: 'unpublished', fields: {} },
        });
        expect(entry.fields.title_text).toBeUndefined();
    });

    it('a scheduled create with a missing required field is rejected', async () => {
        await expect(
            api.create({
                type: 'post',
                data: {
                    title: 'Later',
                    status: 'scheduled',
                    publishedAt: new Date(Date.now() + 60_000),
                    fields: {},
                },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });

    it('correctness still applies to an unpublished create', async () => {
        await expect(
            api.create({
                type: 'post',
                data: {
                    title: 'Draft',
                    status: 'unpublished',
                    fields: { contact_email: 'not-an-email' },
                },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { contact_email: ['Must be a valid email address'] },
        });
    });

    // `fields` is a patch, so emptying the required field means sending it
    // empty — an omitted field keeps its stored value and stays complete.
    it('an update that keeps the row published enforces completeness', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Live', status: 'published', fields: { title_text: 'Hello' } },
        });
        await expect(
            api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { title_text: '' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });

    it('an update of an unpublished row may leave a required field empty', async () => {
        const entry = await api.create({
            type: 'post',
            data: {
                title: 'Draft',
                status: 'unpublished',
                fields: { title_text: 'Hello' },
            },
        });
        const updated = await api.update({
            type: 'post',
            id: entry.id,
            data: { fields: { title_text: '' } },
        });
        const result = Array.isArray(updated) ? updated[0]! : updated;
        expect(result.fields.title_text).toBe('');
    });

    it('an update that publishes the row enforces completeness', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Draft', status: 'unpublished', fields: {} },
        });
        await expect(
            api.update({
                type: 'post',
                id: entry.id,
                data: { status: 'published', fields: {} },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });
});

describe('validation stage — a status change', () => {
    it('publishing a draft with a missing required field is rejected', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Draft', status: 'unpublished', fields: {} },
        });
        await expect(api.publish({ type: 'post', id: entry.id })).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
        const stored = await api.get({ type: 'post', id: entry.id, full: true });
        expect(stored?.status).toBe('unpublished');
    });

    it('scheduling a draft with a missing required field is rejected', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Draft', status: 'unpublished', fields: {} },
        });
        await expect(
            api.schedule({
                type: 'post',
                id: entry.id,
                publishedAt: new Date(Date.now() + 60_000),
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });

    it('an update that only sets the status to published is rejected', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Draft', status: 'unpublished', fields: {} },
        });
        await expect(
            api.update({ type: 'post', id: entry.id, data: { status: 'published' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });

    it('unpublishing never checks completeness', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Draft', status: 'unpublished', fields: {} },
        });
        const un = await api.unpublish({ type: 'post', id: entry.id });
        expect(un.status).toBe('unpublished');
    });
});

describe('create — email validation', () => {
    it('rejects an invalid email value', async () => {
        await expect(
            api.create({
                type: 'post',
                data: {
                    title: 'T',
                    fields: { title_text: 'Hello', contact_email: 'not-an-email' },
                },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: {
                contact_email: ['Must be a valid email address'],
            },
        });
    });

    it('accepts a valid email value', async () => {
        const entry = await api.create({
            type: 'post',
            data: {
                title: 'T',
                fields: { title_text: 'Hello', contact_email: 'user@example.com' },
            },
        });
        expect(entry.fields.contact_email).toBe('user@example.com');
    });
});

describe('create — valid fields', () => {
    it('persists coerced field values on success', async () => {
        const entry = await api.create({
            type: 'post',
            data: {
                title: 'T',
                fields: {
                    title_text: 'Hello World',
                    contact_email: 'hi@example.com',
                    code: 'abc123',
                    page_slug: 'some-page',
                },
            },
        });
        expect(entry.fields.title_text).toBe('Hello World');
        expect(entry.fields.contact_email).toBe('hi@example.com');
        expect(entry.fields.code).toBe('abc123');
        expect(entry.fields.page_slug).toBe('some-page');
        expect(entry.fields.status_label).toBe('pending'); // default applied
    });
});

describe('update — email validation', () => {
    it('rejects an invalid email value on update', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'T', fields: { title_text: 'Hello' } },
        });
        await expect(
            api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { title_text: 'Hello', contact_email: 'bad' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: {
                contact_email: ['Must be a valid email address'],
            },
        });
    });

    it('persists coerced value on valid update', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'T', fields: { title_text: 'Hello' } },
        });
        const updated = await api.update({
            type: 'post',
            id: entry.id,
            data: { fields: { title_text: 'Updated', contact_email: 'new@example.com' } },
        });
        const result = Array.isArray(updated) ? updated[0]! : updated;
        expect(result.fields.contact_email).toBe('new@example.com');
    });
});

describe('update — no spurious version on invalid update', () => {
    it('does not create a version when the update is rejected by field validation', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'V', fields: { title_text: 'Hello' } },
        });

        // Immediately after create, version count should be 0
        const versionsBefore = await api.versions({ type: 'post', id: entry.id });
        expect(versionsBefore).toHaveLength(0);

        // Attempt an invalid update (bad email)
        await expect(
            api.update({
                type: 'post',
                id: entry.id,
                data: { fields: { title_text: 'Hello', contact_email: 'not-an-email' } },
            })
        ).rejects.toMatchObject({ name: 'ValidationError' });

        // Version count must still be 0 — the invalid update must NOT have
        // created a snapshot before the validation threw.
        const versionsAfter = await api.versions({ type: 'post', id: entry.id });
        expect(versionsAfter).toHaveLength(0);
    });
});

describe('duplicate — the copy is parsed as a create', () => {
    async function source() {
        return api.create({
            type: 'post',
            data: { title: 'Source', fields: { title_text: 'Kept', code: 'src' } },
        });
    }

    it('rejects an invalid value in overrides.fields', async () => {
        const entry = await source();
        await expect(
            api.duplicate({
                type: 'post',
                id: entry.id,
                overrides: { fields: { code: 'copy', contact_email: 'bad' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { contact_email: ['Must be a valid email address'] },
        });
    });

    it('drops a key in overrides.fields that names no field', async () => {
        const entry = await source();
        const copy = await api.duplicate({
            type: 'post',
            id: entry.id,
            overrides: { fields: { code: 'copy', stray: 'dropped' } },
        });
        expect(copy.fields).not.toHaveProperty('stray');
    });

    it('rejects a published copy with a missing required field', async () => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'Draft', fields: { code: 'src' } },
        });
        await expect(
            api.duplicate({
                type: 'post',
                id: entry.id,
                overrides: { status: 'published', fields: { code: 'copy' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });
});
