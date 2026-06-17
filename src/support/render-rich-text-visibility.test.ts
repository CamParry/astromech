/**
 * Integration tests for richtext public/full shape delivery.
 *
 * Public shape → HTML string.
 * Full shape   → JSON unchanged.
 */

import { describe, expect, it } from 'vitest';
import type { Entry, FieldDefinition, JsonObject, JsonValue } from '@/types/index.js';
import {
    applyVisibility,
    type AudienceContext,
    type VisibilityOptions,
} from '@/services/entries/visibility.js';

const NOW = new Date('2026-06-15T12:00:00Z');

function audience(now = NOW): AudienceContext {
    return { roleSlug: null, now };
}

function publishedEntry(fields: JsonObject): Entry {
    return {
        id: 'e1',
        type: 'posts',
        locale: 'en',
        localeGroup: 'g1',
        locales: { en: 'e1' },
        slug: 'post',
        title: 'Post',
        fields,
        status: 'published',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
}

function opts(shape: 'public' | 'full', fields: FieldDefinition[]): VisibilityOptions {
    return { shape, fields, audience: audience() };
}

const richtextFields: FieldDefinition[] = [{ name: 'body', type: 'richtext' }];

const richtextJson: JsonValue = {
    type: 'doc',
    content: [
        {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }],
        },
    ],
};

describe('richtext — public shape returns HTML string', () => {
    it('converts JSON doc to HTML string', () => {
        const entry = publishedEntry({ body: richtextJson });
        const result = applyVisibility(entry, opts('public', richtextFields));
        expect(result).not.toBeNull();
        if (result === null) return;
        const body = result.fields['body'];
        expect(typeof body).toBe('string');
        expect(body as string).toContain('Hello world');
        expect(body as string).toContain('<p');
    });

    it('returns empty string for null richtext value', () => {
        const entry = publishedEntry({ body: null });
        const result = applyVisibility(entry, opts('public', richtextFields));
        expect(result).not.toBeNull();
        if (result === null) return;
        expect(result.fields['body']).toBe('');
    });
});

describe('richtext — full shape returns JSON unchanged', () => {
    it('passes JSON doc through without rendering', () => {
        const entry = publishedEntry({ body: richtextJson });
        const result = applyVisibility(entry, opts('full', richtextFields));
        expect(result).not.toBeNull();
        if (result === null) return;
        const body = result.fields['body'];
        expect(typeof body).toBe('object');
        expect(body).toEqual(richtextJson);
    });
});

describe('richtext — heading HTML', () => {
    it('renders heading nodes in public shape', () => {
        const json: JsonValue = {
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 2 },
                    content: [{ type: 'text', text: 'Section' }],
                },
            ],
        };
        const entry = publishedEntry({ body: json });
        const result = applyVisibility(entry, opts('public', richtextFields));
        expect(result).not.toBeNull();
        if (result === null) return;
        const body = result.fields['body'] as string;
        expect(body).toContain('<h2');
        expect(body).toContain('Section');
    });
});
