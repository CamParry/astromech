/**
 * Unit tests for applyVisibility.
 *
 * All tests call the functions directly with hand-built Entry + Field[]
 * — no client, no virtual:astromech/config, no getDb().
 */
import type { AudienceContext, VisibilityOptions } from '@/content/visibility';
import type { Entry, Field } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { applyVisibility } from '@/content/visibility';

const NOW = new Date('2026-06-15T12:00:00Z');

function audience(now = NOW): AudienceContext {
    return { role: null, now };
}

function publishedEntry(overrides: Partial<Entry> = {}): Entry {
    return {
        id: 'entry-1',
        type: 'posts',
        locale: 'en',
        locales: ['en'],
        staged: false,
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

function publicOpts(fields: Field[] = []): VisibilityOptions {
    return { shape: 'public', fields, audience: audience() };
}

function fullOpts(fields: Field[] = []): VisibilityOptions {
    return { shape: 'full', fields, audience: audience() };
}

// (a) Private field stripped in public, present in full

describe('private field projection', () => {
    const fields: Field[] = [
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
        if (!result) return;
        expect(result.fields).not.toHaveProperty('secret');
        expect(result.fields).toHaveProperty('public_body', 'visible text');
    });

    it('keeps private field in full shape', () => {
        const result = applyVisibility(entry, fullOpts(fields));
        expect(result).not.toBeNull();
        if (!result) return;
        expect(result.fields).toHaveProperty('secret', 'hidden value');
    });

    it('does not mutate the original entry fields', () => {
        applyVisibility(entry, publicOpts(fields));
        expect(entry.fields).toHaveProperty('secret', 'hidden value');
    });
});

describe('private fields under layout fields', () => {
    it('strips every field inside a private unnamed group', () => {
        const fields: Field[] = [
            { name: 'title', type: 'text' },
            { type: 'group', private: true, fields: [{ name: 'notes', type: 'text' }] },
        ];
        const entry = publishedEntry({ fields: { title: 'Hello', notes: 'internal' } });
        expect(applyVisibility(entry, publicOpts(fields))?.fields).toEqual({
            title: 'Hello',
        });
    });

    it('strips a private field under a layout field inside a named group', () => {
        const fields: Field[] = [
            {
                name: 'meta',
                type: 'group',
                fields: [
                    {
                        type: 'group',
                        fields: [
                            { name: 'shown', type: 'text' },
                            { name: 'hidden', type: 'text', private: true },
                        ],
                    },
                ],
            },
        ];
        const entry = publishedEntry({
            fields: { meta: { shown: 'yes', hidden: 'no' } },
        });
        expect(applyVisibility(entry, publicOpts(fields))?.fields).toEqual({
            meta: { shown: 'yes' },
        });
    });

    it('strips a private field under a layout field inside a block', () => {
        const fields: Field[] = [
            {
                name: 'body',
                type: 'blocks',
                blocks: [
                    {
                        type: 'hero',
                        fields: [
                            {
                                type: 'accordion',
                                label: 'More',
                                fields: [{ name: 'hidden', type: 'text', private: true }],
                            },
                            { name: 'heading', type: 'text' },
                        ],
                    },
                ],
            },
        ];
        const entry = publishedEntry({
            fields: {
                body: [{ _id: 'b1', _type: 'hero', heading: 'Hi', hidden: 'no' }],
            },
        });
        expect(applyVisibility(entry, publicOpts(fields))?.fields).toEqual({
            body: [{ _id: 'b1', _type: 'hero', heading: 'Hi' }],
        });
    });
});

// (b) _disabled item removed; _disabled/_title deleted on survivors; _type/_id kept

describe('structural strip (_disabled items)', () => {
    const fields: Field[] = [
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
                {
                    _type: 'text',
                    _id: 'b1',
                    _disabled: false,
                    _title: 'Block 1',
                    content: 'hello',
                },
                {
                    _type: 'image',
                    _id: 'b2',
                    _disabled: true,
                    _title: 'Hidden Block',
                    url: '/img.png',
                },
                { _type: 'text', _id: 'b3', _title: 'Block 3', content: 'world' },
            ],
        },
    });

    it('removes _disabled items from arrays', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        expect(result).not.toBeNull();
        if (!result) return;
        const blocks = result.fields['blocks'] as Record<string, unknown>[];
        expect(blocks).toHaveLength(2);
        expect(blocks.map((b) => b['_id'])).toEqual(['b1', 'b3']);
    });

    it('deletes _disabled and _title from surviving objects', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        if (!result) return;
        const blocks = result.fields['blocks'] as Record<string, unknown>[];
        for (const block of blocks) {
            expect(block).not.toHaveProperty('_disabled');
            expect(block).not.toHaveProperty('_title');
        }
    });

    it('keeps _type and _id on surviving objects', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        if (!result) return;
        const blocks = result.fields['blocks'] as Record<string, unknown>[];
        expect(blocks[0]).toHaveProperty('_type', 'text');
        expect(blocks[0]).toHaveProperty('_id', 'b1');
        expect(blocks[1]).toHaveProperty('_type', 'text');
        expect(blocks[1]).toHaveProperty('_id', 'b3');
    });

    it('does not strip _disabled in full shape', () => {
        const result = applyVisibility(entry, fullOpts(fields));
        if (!result) return;
        const blocks = result.fields['blocks'] as Record<string, unknown>[];
        expect(blocks).toHaveLength(3);
    });
});

// (c) Draft / scheduled-future row → null in public

describe('row filter (audience)', () => {
    it('returns null for unpublished entries in public', () => {
        const entry = publishedEntry({ status: 'unpublished' });
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

    it('passes unpublished entries in full shape', () => {
        const entry = publishedEntry({ status: 'unpublished' });
        expect(applyVisibility(entry, fullOpts())).not.toBeNull();
    });

    it('passes trashed entries in full shape', () => {
        const entry = publishedEntry({ deletedAt: new Date() });
        expect(applyVisibility(entry, fullOpts())).not.toBeNull();
    });
});

describe('nested blocks-in-repeater strip', () => {
    const fields: Field[] = [
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
                        {
                            _type: 'paragraph',
                            _id: 'p1',
                            _disabled: false,
                            _title: 'P1',
                            text: 'Hello',
                        },
                        {
                            _type: 'paragraph',
                            _id: 'p2',
                            _disabled: true,
                            _title: 'Hidden',
                            text: 'Secret',
                        },
                    ],
                },
            ],
        },
    });

    it('strips private fields inside repeater items', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        expect(result).not.toBeNull();
        if (!result) return;
        const sections = result.fields['sections'] as Record<string, unknown>[];
        expect(sections[0]).not.toHaveProperty('secret_note');
        expect(sections[0]).toHaveProperty('heading', 'Section 1');
    });

    it('removes _disabled blocks inside repeater items', () => {
        const result = applyVisibility(entry, publicOpts(fields));
        if (!result) return;
        const sections = result.fields['sections'] as Record<string, unknown>[];
        const section0 = sections[0];
        if (!section0) return;
        const content = section0['content'] as Record<string, unknown>[];
        expect(content).toHaveLength(1);
        const item0 = content[0];
        if (!item0) return;
        expect(item0['_id']).toBe('p1');
        expect(item0).not.toHaveProperty('_disabled');
        expect(item0).not.toHaveProperty('_title');
    });
});

// (e) A relation value is a raw id and passes through untouched

describe('relation values', () => {
    const fields: Field[] = [
        { name: 'author', type: 'relationship', target: 'authors' },
        { name: 'tags', type: 'relationship', target: 'tags', multiple: true },
    ];

    it('passes a single relation id through the public projection', () => {
        const entry = publishedEntry({ fields: { author: 'author-1' } });
        const result = applyVisibility(entry, publicOpts(fields));
        expect(result?.fields['author']).toBe('author-1');
    });

    it('passes a multi-relation id list through the public projection', () => {
        const entry = publishedEntry({ fields: { tags: ['t1', 't2'] } });
        const result = applyVisibility(entry, publicOpts(fields));
        expect(result?.fields['tags']).toEqual(['t1', 't2']);
    });

    it('strips a private relation field', () => {
        const privateRel: Field[] = [
            { name: 'author', type: 'relationship', target: 'authors', private: true },
        ];
        const entry = publishedEntry({ fields: { author: 'author-1' } });
        const result = applyVisibility(entry, publicOpts(privateRel));
        expect(result?.fields).not.toHaveProperty('author');
    });
});
