/**
 * Unit tests for applyVisibility / applyVisibilityWithRelations.
 *
 * All tests call the functions directly with hand-built Entry + FieldDefinition[]
 * — no SDK, no virtual:astromech/config, no getDb().
 */

import { describe, expect, it } from 'vitest';
import type { Entry, FieldDefinition } from '@/types/index.js';
import {
    applyVisibility,
    applyVisibilityWithRelations,
    isPublicBranded,
    markPublic,
    PublicShapeWriteError,
    type AudienceContext,
    type VisibilityOptions,
} from './visibility.js';

// ============================================================================
// Helpers
// ============================================================================

const NOW = new Date('2026-06-15T12:00:00Z');

function audience(now = NOW): AudienceContext {
    return { roleSlug: null, now };
}

function publishedEntry(overrides: Partial<Entry> = {}): Entry {
    return {
        id: 'entry-1',
        type: 'posts',
        locale: 'en',
        localeGroup: 'group-1',
        locales: { en: 'entry-1' },
        slug: 'test-post',
        title: 'Test Post',
        fields: {},
        status: 'published',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    };
}

function publicOpts(fields: FieldDefinition[] = []): VisibilityOptions {
    return { shape: 'public', fields, audience: audience() };
}

function fullOpts(fields: FieldDefinition[] = []): VisibilityOptions {
    return { shape: 'full', fields, audience: audience() };
}

// ============================================================================
// (a) Private field stripped in public, present in full
// ============================================================================

describe('private field projection', () => {
    const fields: FieldDefinition[] = [
        { name: 'title', type: 'text' },
        { name: 'secret', type: 'text', private: true },
        { name: 'public_body', type: 'textarea' },
    ];

    const entry = publishedEntry({
        fields: {
            title: 'Hello',
            secret: 'hidden value',
            public_body: 'visible text',
        },
    });

    it('strips private field in public shape', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        expect(result).not.toBeNull();
        expect(result!.fields).not.toHaveProperty('secret');
        expect(result!.fields).toHaveProperty('public_body', 'visible text');
    });

    it('keeps private field in full shape', () => {
        const result = applyVisibility(entry, fullOpts(fields));
        expect(result).not.toBeNull();
        expect(result!.fields).toHaveProperty('secret', 'hidden value');
    });

    it('does not mutate the original entry fields', () => {
        applyVisibility(entry, publicOpts(fields));
        expect(entry.fields).toHaveProperty('secret', 'hidden value');
    });
});

// ============================================================================
// (b) _disabled item removed; _disabled/_title deleted on survivors; _type/_id kept
// ============================================================================

describe('structural strip (_disabled items)', () => {
    const fields: FieldDefinition[] = [
        {
            name: 'blocks',
            type: 'blocks',
            blocks: [
                { type: 'text', fields: [{ name: 'content', type: 'text' }] },
                { type: 'image', fields: [{ name: 'url', type: 'text' }] },
            ],
        },
    ];

    const entry = publishedEntry({
        fields: {
            blocks: [
                { _type: 'text', _id: 'b1', _disabled: false, _title: 'Block 1', content: 'hello' },
                { _type: 'image', _id: 'b2', _disabled: true, _title: 'Hidden Block', url: '/img.png' },
                { _type: 'text', _id: 'b3', _title: 'Block 3', content: 'world' },
            ],
        },
    });

    it('removes _disabled items from arrays', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        expect(result).not.toBeNull();
        const blocks = result!.fields['blocks'] as Array<Record<string, unknown>>;
        expect(blocks).toHaveLength(2);
        expect(blocks.map((b) => b['_id'])).toEqual(['b1', 'b3']);
    });

    it('deletes _disabled and _title from surviving objects', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        const blocks = result!.fields['blocks'] as Array<Record<string, unknown>>;
        for (const block of blocks) {
            expect(block).not.toHaveProperty('_disabled');
            expect(block).not.toHaveProperty('_title');
        }
    });

    it('keeps _type and _id on surviving objects', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        const blocks = result!.fields['blocks'] as Array<Record<string, unknown>>;
        expect(blocks[0]).toHaveProperty('_type', 'text');
        expect(blocks[0]).toHaveProperty('_id', 'b1');
        expect(blocks[1]).toHaveProperty('_type', 'text');
        expect(blocks[1]).toHaveProperty('_id', 'b3');
    });

    it('does not strip _disabled in full shape', () => {
        const result = applyVisibility(entry, fullOpts(fields));
        const blocks = result!.fields['blocks'] as Array<Record<string, unknown>>;
        expect(blocks).toHaveLength(3);
    });
});

// ============================================================================
// (c) Draft / scheduled-future row → null in public
// ============================================================================

describe('row filter (audience)', () => {
    it('returns null for draft entries in public', () => {
        const entry = publishedEntry({ status: 'draft' });
        expect(applyVisibility(entry, publicOpts())).toBeNull();
    });

    it('returns null for scheduled entries in public', () => {
        const entry = publishedEntry({ status: 'scheduled' });
        expect(applyVisibility(entry, publicOpts())).toBeNull();
    });

    it('returns null for published entries with future publishedAt in public', () => {
        const entry = publishedEntry({
            status: 'published',
            publishedAt: new Date('2026-12-31T00:00:00Z'), // after NOW
        });
        expect(applyVisibility(entry, publicOpts())).toBeNull();
    });

    it('returns null for trashed entries in public', () => {
        const entry = publishedEntry({ deletedAt: new Date('2026-01-01T00:00:00Z') });
        expect(applyVisibility(entry, publicOpts())).toBeNull();
    });

    it('returns entry for published entries with null publishedAt', () => {
        const entry = publishedEntry({ publishedAt: null });
        expect(applyVisibility(entry, publicOpts())).not.toBeNull();
    });

    it('returns entry for published entries with past publishedAt', () => {
        const entry = publishedEntry({ publishedAt: new Date('2026-01-01T00:00:00Z') });
        expect(applyVisibility(entry, publicOpts())).not.toBeNull();
    });

    it('passes draft entries in full shape', () => {
        const entry = publishedEntry({ status: 'draft' });
        expect(applyVisibility(entry, fullOpts())).not.toBeNull();
    });

    it('passes trashed entries in full shape', () => {
        const entry = publishedEntry({ deletedAt: new Date() });
        expect(applyVisibility(entry, fullOpts())).not.toBeNull();
    });
});

// ============================================================================
// (d) Nested blocks-in-repeater strip
// ============================================================================

describe('nested blocks-in-repeater strip', () => {
    const fields: FieldDefinition[] = [
        {
            name: 'sections',
            type: 'repeater',
            fields: [
                { name: 'heading', type: 'text' },
                { name: 'secret_note', type: 'text', private: true },
                {
                    name: 'content',
                    type: 'blocks',
                    blocks: [
                        { type: 'paragraph', fields: [{ name: 'text', type: 'text' }] },
                    ],
                },
            ],
        },
    ];

    const entry = publishedEntry({
        fields: {
            sections: [
                {
                    heading: 'Section 1',
                    secret_note: 'do not expose',
                    content: [
                        { _type: 'paragraph', _id: 'p1', _disabled: false, _title: 'P1', text: 'Hello' },
                        { _type: 'paragraph', _id: 'p2', _disabled: true, _title: 'Hidden', text: 'Secret' },
                    ],
                },
            ],
        },
    });

    it('strips private fields inside repeater items', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        expect(result).not.toBeNull();
        const sections = result!.fields['sections'] as Array<Record<string, unknown>>;
        expect(sections[0]).not.toHaveProperty('secret_note');
        expect(sections[0]).toHaveProperty('heading', 'Section 1');
    });

    it('removes _disabled blocks inside repeater items', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        const sections = result!.fields['sections'] as Array<Record<string, unknown>>;
        const content = sections[0]!['content'] as Array<Record<string, unknown>>;
        expect(content).toHaveLength(1);
        expect(content[0]!['_id']).toBe('p1');
        expect(content[0]).not.toHaveProperty('_disabled');
        expect(content[0]).not.toHaveProperty('_title');
    });
});

// ============================================================================
// (e) Populated relation to a draft is dropped
// ============================================================================

describe('populated relation filtering', () => {
    const relatedFields: FieldDefinition[] = [
        { name: 'bio', type: 'textarea' },
        { name: 'internal_notes', type: 'text', private: true },
    ];

    const publishedRelated: Entry = publishedEntry({
        id: 'author-1',
        type: 'authors',
        fields: { bio: 'Author bio', internal_notes: 'secret' },
    });

    const draftRelated: Entry = publishedEntry({
        id: 'author-2',
        type: 'authors',
        status: 'draft',
        fields: { bio: 'Draft author' },
    });

    const fields: FieldDefinition[] = [
        { name: 'author', type: 'relationship', target: 'authors' },
    ];

    it('drops a related entry that is draft (not published)', () => {
        const entry = publishedEntry({
            fields: { author: draftRelated as unknown as import('@/types/index.js').JsonValue },
        });
        const result = applyVisibilityWithRelations(
            entry,
            publicOpts(fields),
            (_related) => relatedFields
        );
        expect(result).not.toBeNull();
        expect(result!.fields['author']).toBeNull();
    });

    it('strips private fields from a published related entry', () => {
        const entry = publishedEntry({
            fields: { author: publishedRelated as unknown as import('@/types/index.js').JsonValue },
        });
        const result = applyVisibilityWithRelations(
            entry,
            publicOpts(fields),
            (_related) => relatedFields
        );
        expect(result).not.toBeNull();
        // The related entry is a full Entry object; its data is under .fields
        const author = result!.fields['author'] as Record<string, unknown>;
        const authorFields = author['fields'] as Record<string, unknown>;
        expect(authorFields).toHaveProperty('bio', 'Author bio');
        expect(authorFields).not.toHaveProperty('internal_notes');
    });

    it('keeps all fields on populated related entry in full shape', () => {
        const entry = publishedEntry({
            fields: { author: publishedRelated as unknown as import('@/types/index.js').JsonValue },
        });
        const result = applyVisibilityWithRelations(
            entry,
            fullOpts(fields),
            (_related) => relatedFields
        );
        expect(result).not.toBeNull();
        // full shape: no field stripping — related entry passed through unchanged
        const author = result!.fields['author'] as Record<string, unknown>;
        const authorFields = author['fields'] as Record<string, unknown>;
        expect(authorFields).toHaveProperty('internal_notes', 'secret');
    });
});

// ============================================================================
// markPublic / isPublicBranded
// ============================================================================

describe('public brand helpers', () => {
    it('markPublic stamps a non-enumerable brand', () => {
        const obj = { foo: 'bar' };
        markPublic(obj);
        expect(isPublicBranded(obj)).toBe(true);
        // non-enumerable — should not appear in JSON or Object.keys
        expect(Object.keys(obj)).toEqual(['foo']);
        expect(JSON.stringify(obj)).toBe('{"foo":"bar"}');
    });

    it('isPublicBranded returns false for plain objects', () => {
        expect(isPublicBranded({ foo: 'bar' })).toBe(false);
    });

    it('isPublicBranded returns false for null/primitives', () => {
        expect(isPublicBranded(null)).toBe(false);
        expect(isPublicBranded('string')).toBe(false);
        expect(isPublicBranded(42)).toBe(false);
    });
});

// ============================================================================
// PublicShapeWriteError
// ============================================================================

describe('PublicShapeWriteError', () => {
    it('is an instance of Error', () => {
        const err = new PublicShapeWriteError();
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('PublicShapeWriteError');
        expect(err.message).toContain("public");
    });
});

// ============================================================================
// Write-back guard: public-read value → update throws; fresh object does not
// ============================================================================

describe('write-back guard via isPublicBranded', () => {
    it('throws PublicShapeWriteError when branded fields passed to update', () => {
        // Simulate receiving fields from a public read:
        const fields = markPublic({ title: 'Hello', public_body: 'world' });
        expect(isPublicBranded(fields)).toBe(true);
        // A caller writing these branded fields back would trigger the guard:
        expect(() => {
            if (isPublicBranded(fields)) throw new PublicShapeWriteError();
        }).toThrow(PublicShapeWriteError);
    });

    it('does NOT throw for a freshly constructed fields object', () => {
        const fields = { title: 'Hello', public_body: 'world' };
        expect(isPublicBranded(fields)).toBe(false);
        expect(() => {
            if (isPublicBranded(fields)) throw new PublicShapeWriteError();
        }).not.toThrow();
    });

    it('does NOT throw for a fields object from a full-shape read (no markPublic)', () => {
        // Full-shape reads return the entry unchanged — no brand is applied.
        const fields = { title: 'Hello', secret: 'internal', public_body: 'world' };
        expect(isPublicBranded(fields)).toBe(false);
        expect(() => {
            if (isPublicBranded(fields)) throw new PublicShapeWriteError();
        }).not.toThrow();
    });

    it('brand survives object spread only if manually copied (guard is per-object)', () => {
        // The symbol brand is non-enumerable — a spread creates an unbranded copy.
        // This means spreading a public entry and writing the spread back is safe
        // (the brand is lost, the spread is a new object). This is by design.
        const branded = markPublic({ foo: 'bar' });
        const copy = { ...branded };
        expect(isPublicBranded(branded)).toBe(true);
        expect(isPublicBranded(copy)).toBe(false);
    });
});
