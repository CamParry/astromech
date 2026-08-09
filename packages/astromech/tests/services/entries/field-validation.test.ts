/**
 * Integration tests for the field-processing pipeline wired into the entries
 * service (create + update). Validates coercion, defaults, required, email,
 * uniqueness, and version-snapshot guard.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { Astromech } from '@/transport/local/index';
import type { AstromechConfig } from '@/types/index';

const api = Astromech.entries;

// ---------------------------------------------------------------------------
// Custom config with validation-heavy fields on `post`
// ---------------------------------------------------------------------------

function makeValidationConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            post: {
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
                    // Text field with unique constraint
                    {
                        name: 'code',
                        type: 'text',
                        label: 'Code',
                        validation: [{ unique: true }],
                    },
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
            },
            // `statuses: false` — no draft concept, so every write is a publish.
            snippet: {
                ...base.entries['snippet'],
                single: 'Snippet',
                plural: 'Snippets',
                titleField: false,
                statuses: false,
                slug: false,
                fields: [{ name: 'key', type: 'text', label: 'Key', required: true }],
            },
        },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeValidationConfig());
});

// ============================================================================
// create: required field
// ============================================================================

describe('create — required field', () => {
    it('rejects when required field is absent', async () => {
        await expect(
            api.create({
                type: 'post',
                title: 'T',
                status: 'published',
                fields: {},
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
                title: 'T',
                status: 'published',
                fields: { title_text: '' },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { title_text: ['This field is required'] },
        });
    });
});

// ============================================================================
// stage: completeness is publish-only
// ============================================================================

describe('validation stage — derived from the status the row will hold', () => {
    it('an unpublished create with a missing required field succeeds', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'Draft',
            status: 'unpublished',
            fields: {},
        });
        expect(entry.fields.title_text).toBeUndefined();
    });

    it('a scheduled create with a missing required field is rejected', async () => {
        await expect(
            api.create({
                type: 'post',
                title: 'Later',
                status: 'scheduled',
                publishAt: new Date(Date.now() + 60_000),
                fields: {},
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
                title: 'Draft',
                status: 'unpublished',
                fields: { contact_email: 'not-an-email' },
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
            title: 'Live',
            status: 'published',
            fields: { title_text: 'Hello' },
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
            title: 'Draft',
            status: 'unpublished',
            fields: { title_text: 'Hello' },
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
            title: 'Draft',
            status: 'unpublished',
            fields: {},
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

// ============================================================================
// stage: a type with statuses OFF is always a publish
// ============================================================================

describe('validation stage — statuses: false', () => {
    it('rejects a missing required field on create', async () => {
        await expect(api.create({ type: 'snippet', fields: {} })).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { key: ['This field is required'] },
        });
    });

    it('rejects a missing required field on update', async () => {
        const entry = await api.create({ type: 'snippet', fields: { key: 'k' } });
        await expect(
            api.update({ type: 'snippet', id: entry.id, data: { fields: { key: '' } } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { key: ['This field is required'] },
        });
    });
});

// ============================================================================
// create: defaultValue
// ============================================================================

describe('create — defaultValue', () => {
    it('applies defaultValue when field is absent', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { title_text: 'Hello' },
        });
        expect(entry.fields.status_label).toBe('pending');
    });

    it('does not override an explicit value with the default', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { title_text: 'Hello', status_label: 'active' },
        });
        expect(entry.fields.status_label).toBe('active');
    });
});

// ============================================================================
// create: slug coercion
// ============================================================================

describe('create — slug coercion', () => {
    it('coerces slug field input to slugified form', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { title_text: 'Hello', page_slug: 'My Title' },
        });
        expect(entry.fields.page_slug).toBe('my-title');
    });
});

// ============================================================================
// create: email validation
// ============================================================================

describe('create — email validation', () => {
    it('rejects an invalid email value', async () => {
        await expect(
            api.create({
                type: 'post',
                title: 'T',
                fields: { title_text: 'Hello', contact_email: 'not-an-email' },
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
            title: 'T',
            fields: { title_text: 'Hello', contact_email: 'user@example.com' },
        });
        expect(entry.fields.contact_email).toBe('user@example.com');
    });
});

// ============================================================================
// create: all valid fields
// ============================================================================

describe('create — valid fields', () => {
    it('persists coerced field values on success', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: {
                title_text: 'Hello World',
                contact_email: 'hi@example.com',
                code: 'abc123',
                page_slug: 'Some Page',
            },
        });
        expect(entry.fields.title_text).toBe('Hello World');
        expect(entry.fields.contact_email).toBe('hi@example.com');
        expect(entry.fields.code).toBe('abc123');
        expect(entry.fields.page_slug).toBe('some-page');
        expect(entry.fields.status_label).toBe('pending'); // default applied
    });
});

// ============================================================================
// create: uniqueness
// ============================================================================

describe('create — uniqueness', () => {
    it('rejects a second entry with a duplicate unique-field value', async () => {
        await api.create({
            type: 'post',
            title: 'First',
            fields: { title_text: 'T1', code: 'x' },
        });
        await expect(
            api.create({
                type: 'post',
                title: 'Second',
                fields: { title_text: 'T2', code: 'x' },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { code: ['Already in use'] },
        });
    });

    it('accepts a different unique-field value', async () => {
        await api.create({
            type: 'post',
            title: 'First',
            fields: { title_text: 'T1', code: 'x' },
        });
        const entry = await api.create({
            type: 'post',
            title: 'Second',
            fields: { title_text: 'T2', code: 'y' },
        });
        expect(entry.fields.code).toBe('y');
    });
});

// ============================================================================
// update: email validation
// ============================================================================

describe('update — email validation', () => {
    it('rejects an invalid email value on update', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { title_text: 'Hello' },
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
            title: 'T',
            fields: { title_text: 'Hello' },
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

// ============================================================================
// update: does not create a spurious version on invalid update
// ============================================================================

describe('update — no spurious version on invalid update', () => {
    it('does not create a version when the update is rejected by field validation', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'V',
            fields: { title_text: 'Hello' },
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

// ============================================================================
// update: uniqueness excludes self
// ============================================================================

describe('update — uniqueness excludes self', () => {
    it('does not trip "Already in use" when an entry keeps its own unique value', async () => {
        const entry = await api.create({
            type: 'post',
            title: 'T',
            fields: { title_text: 'Hello', code: 'mycode' },
        });

        // Update with the same code — should succeed (self-exclusion)
        const updated = await api.update({
            type: 'post',
            id: entry.id,
            data: { fields: { title_text: 'Hello updated', code: 'mycode' } },
        });
        const result = Array.isArray(updated) ? updated[0]! : updated;
        expect(result.fields.code).toBe('mycode');
    });

    it('rejects when the code collides with a DIFFERENT entry', async () => {
        await api.create({
            type: 'post',
            title: 'A',
            fields: { title_text: 'A', code: 'taken' },
        });
        const entryB = await api.create({
            type: 'post',
            title: 'B',
            fields: { title_text: 'B', code: 'free' },
        });

        await expect(
            api.update({
                type: 'post',
                id: entryB.id,
                data: { fields: { title_text: 'B', code: 'taken' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { code: ['Already in use'] },
        });
    });
});
