/**
 * Behavior tests for `titleField: false` entry types (Phase 2, slice 4).
 *
 * The harness (`makeTestConfig`) provides:
 * - `snippet` — titleless, statuses off, slug off
 * - `card` — titleless, slug capability on
 * - `bookmark` — titled, with a relationship field targeting `snippet`
 * - `post` — titled (used here to pin the unchanged "Title is required" path)
 *
 * Implementation choices characterized here:
 * - A titleless create persists `title === ''` (the DB column is notNull).
 * - With no explicit slug, a titleless create leaves `slug` NULL — the empty
 *   title is never run through `titleToSlug` (avoids "-2"-style derived slugs).
 * - Passing an explicit `title` to a titleless type is ACCEPTED AND STORED (the
 *   schema keeps title optional rather than stripping it); the admin never sends
 *   one, so this is a tolerant-not-strict choice.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@/errors/validation.js';
import { createTestDb, setupTestConfig } from '@/test/harness.js';
import { Astromech } from '@/sdk/local/index.js';

const api = Astromech.entries;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

// ============================================================================
// create
// ============================================================================

describe('titleless create', () => {
    it('succeeds with no title and persists title as empty string', async () => {
        const e = await api.create({ type: 'snippet', fields: { key: 'k', value: 'v' } });
        expect(e.type).toBe('snippet');
        expect(e.title).toBe('');
        expect(e.fields).toEqual({ key: 'k', value: 'v' });
    });

    it('leaves slug null when no explicit slug is given', async () => {
        const e = await api.create({ type: 'card', fields: { label: 'a' } });
        expect(e.slug).toBeNull();
    });

    it('does not derive a "-2" style slug for multiple titleless entries', async () => {
        const a = await api.create({ type: 'card' });
        const b = await api.create({ type: 'card' });
        expect(a.slug).toBeNull();
        expect(b.slug).toBeNull();
    });

    it('accepts an explicit slug when the slug capability is on', async () => {
        const e = await api.create({ type: 'card', slug: 'my-card' });
        expect(e.slug).toBe('my-card');
    });

    it('uniquifies explicit slugs on a titleless type', async () => {
        const a = await api.create({ type: 'card', slug: 'dup' });
        const b = await api.create({ type: 'card', slug: 'dup' });
        expect(a.slug).toBe('dup');
        expect(b.slug).toBe('dup-2');
    });

    it('accepts and stores an explicit title on a titleless type', async () => {
        const e = await api.create({ type: 'snippet', title: 'Kept' });
        expect(e.title).toBe('Kept');
    });

    it('defaults status to draft (statuses capability off still stores a status)', async () => {
        const e = await api.create({ type: 'snippet' });
        expect(e.status).toBe('draft');
    });
});

// ============================================================================
// titled types are unchanged
// ============================================================================

describe('titled types still require a title', () => {
    it('throws a validation error when the title is omitted', async () => {
        try {
            // title omitted — runtime schema still rejects it for titled types
            await api.create({ type: 'post' });
            throw new Error('expected create to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
        }
    });

    it('rejects an empty-string title on a titled type with "Title is required"', async () => {
        try {
            await api.create({ type: 'post', title: '' });
            throw new Error('expected create to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            expect((err as ValidationError).issues[0]?.message).toBe('Title is required');
        }
    });
});

// ============================================================================
// update
// ============================================================================

describe('titleless update', () => {
    it('updates fields and leaves title empty', async () => {
        const e = await api.create({ type: 'snippet', fields: { key: 'k', value: 'v1' } });
        const updated = await api.update({
            type: 'snippet',
            id: e.id,
            data: { fields: { key: 'k', value: 'v2' } },
        });
        expect((updated as { title: string }).title).toBe('');
        expect((updated as { fields: Record<string, unknown> }).fields).toEqual({
            key: 'k',
            value: 'v2',
        });
    });
});

// ============================================================================
// search
// ============================================================================

describe('titleless search', () => {
    it('matches nothing (search runs a LIKE on the empty title)', async () => {
        await api.create({ type: 'snippet', fields: { key: 'k', value: 'v' } });
        const result = await api.query({ type: 'snippet', search: 'anything' });
        expect(result.data).toHaveLength(0);
    });

    it('returns titleless entries when no search term is given', async () => {
        await api.create({ type: 'snippet', fields: { key: 'k', value: 'v' } });
        const result = await api.query({ type: 'snippet' });
        expect(result.data).toHaveLength(1);
    });
});

// ============================================================================
// relationships into a titleless target
// ============================================================================

describe('relationships targeting a titleless type', () => {
    it('reports the empty sourceTitle for a titled source referencing a snippet', async () => {
        const snippet = await api.create({ type: 'snippet', fields: { key: 'k' } });
        const bookmark = await api.create({
            type: 'bookmark',
            title: 'My Bookmark',
            fields: { snippet: snippet.id },
        });

        const incoming = await api.incomingRelations({
            type: 'snippet',
            id: snippet.id,
        });
        expect(incoming).toHaveLength(1);
        expect(incoming[0]?.sourceId).toBe(bookmark.id);
        // The source is titled, so its title comes through normally; the
        // DeleteEntryModal falls back to `sourceId` only when this is empty.
        expect(incoming[0]?.sourceTitle).toBe('My Bookmark');
    });
});
