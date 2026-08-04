/**
 * The validation toast has to name fields, and the only thing it is handed is a
 * map keyed by the `_id` path grammar.
 *
 * That grammar is addressing: `sections[a1b2].title` names a container ITEM by
 * its persisted id, which is meaningless to an author, and it carries declared
 * NAMES rather than labels. Resolving one back to a label therefore means
 * walking the field tree, stepping over the item segments — and knowing when to
 * give up, because a `blocks` path cannot tell which block type an item is
 * without seeing the value.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import type { FieldDefinition } from '@/types/index.js';
import {
    fieldErrorNames,
    fieldLabelPathForError,
    validationSummaryMessage,
} from '@/admin/components/fields/field-error-summary.js';
import en from '@/admin/locales/en.json' with { type: 'json' };

// ============================================================================
// Path → label chain
// ============================================================================

const definitions: FieldDefinition[] = [
    { name: 'title', type: 'text', label: 'Headline' },
    // No label — resolves to the same fallback the field's own label renders.
    { name: 'meta_description', type: 'text' },
    // A layout field holds no data, so it never appears in a path.
    {
        name: 'main',
        type: 'tabs',
        fields: [
            {
                name: 'seo',
                type: 'group',
                label: 'Search',
                fields: [{ name: 'title', type: 'text', label: 'SEO title' }],
            },
        ],
    },
    {
        name: 'sections',
        type: 'repeater',
        label: 'Sections',
        fields: [
            { name: 'heading', type: 'text', label: 'Heading' },
            {
                name: 'items',
                type: 'repeater',
                label: 'Items',
                fields: [{ name: 'title', type: 'text', label: 'Item title' }],
            },
        ],
    },
    {
        name: 'content',
        type: 'blocks',
        label: 'Content',
        blocks: [
            {
                type: 'hero',
                fields: [
                    { name: 'heading', type: 'text', label: 'Heading' },
                    { name: 'cta', type: 'text', label: 'Call to action' },
                ],
            },
            {
                type: 'quote',
                fields: [
                    { name: 'heading', type: 'text', label: 'Heading' },
                    { name: 'cta', type: 'text', label: 'Attribution' },
                ],
            },
        ],
    },
];

describe('fieldLabelPathForError', () => {
    it('resolves a top-level field', () => {
        expect(fieldLabelPathForError(definitions, 'title')).toEqual(['Headline']);
    });

    it('falls back to the field name title-cased when no label is declared', () => {
        expect(fieldLabelPathForError(definitions, 'meta_description')).toEqual([
            'Meta Description',
        ]);
    });

    it('descends into a group, unwrapping the layout field above it', () => {
        expect(fieldLabelPathForError(definitions, 'seo.title')).toEqual([
            'Search',
            'SEO title',
        ]);
    });

    it('steps over a repeater item id', () => {
        expect(fieldLabelPathForError(definitions, 'sections[a1b2].heading')).toEqual([
            'Sections',
            'Heading',
        ]);
    });

    it('steps over every item id of a nested repeater', () => {
        expect(
            fieldLabelPathForError(definitions, 'sections[a1b2].items[c3d4].title')
        ).toEqual(['Sections', 'Items', 'Item title']);
    });

    it('resolves a blocks sub-field the block types agree on', () => {
        expect(fieldLabelPathForError(definitions, 'content[b1].heading')).toEqual([
            'Content',
            'Heading',
        ]);
    });

    it('gives up on a blocks sub-field the block types label differently', () => {
        // `cta` is "Call to action" in a hero and "Attribution" in a quote, and
        // the path carries no `_type` to choose between them.
        expect(fieldLabelPathForError(definitions, 'content[b1].cta')).toBeNull();
    });

    it('returns null for a field the schema does not declare', () => {
        expect(fieldLabelPathForError(definitions, 'nope')).toBeNull();
    });

    it('returns null when a leaf is asked to descend', () => {
        expect(fieldLabelPathForError(definitions, 'title.deeper')).toBeNull();
    });

    it('returns null for a malformed path rather than throwing', () => {
        expect(fieldLabelPathForError(definitions, 'sections[a1')).toBeNull();
    });
});

// ============================================================================
// Label chain → sentence
// ============================================================================

let t: TFunction;

beforeAll(async () => {
    const instance = i18next.createInstance();
    await instance.init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
    t = instance.t.bind(instance) as TFunction;
});

describe('validationSummaryMessage', () => {
    it('names a single field', () => {
        expect(validationSummaryMessage(['Headline'], t)).toBe('Please fix Headline.');
    });

    it('names two fields', () => {
        expect(validationSummaryMessage(['Headline', 'Slug'], t)).toBe(
            'Please fix Headline, Slug.'
        );
    });

    it('names three fields', () => {
        expect(validationSummaryMessage(['Headline', 'Slug', 'Body'], t)).toBe(
            'Please fix Headline, Slug, Body.'
        );
    });

    it('names three and counts the rest, singular', () => {
        expect(validationSummaryMessage(['A', 'B', 'C', 'D'], t)).toBe(
            'Please fix A, B, C and 1 more field.'
        );
    });

    it('names three and counts the rest, plural', () => {
        expect(validationSummaryMessage(['A', 'B', 'C', 'D', 'E'], t)).toBe(
            'Please fix A, B, C and 2 more fields.'
        );
    });

    it('falls back to the generic message with nothing to name', () => {
        expect(validationSummaryMessage([], t)).toBe(
            'Please fix the highlighted fields.'
        );
    });
});

// ============================================================================
// Map → names
// ============================================================================

describe('fieldErrorNames', () => {
    it('joins a nested chain and keeps map order', () => {
        const names = fieldErrorNames(
            {
                'sections[a1b2].items[c3d4].title': ['Required'],
                title: ['Required'],
            },
            definitions,
            (label) => (typeof label === 'string' ? label : label.$t)
        );
        expect(names).toEqual(['Sections → Items → Item title', 'Headline']);
    });

    it('falls back to the raw path when the label cannot be resolved', () => {
        const names = fieldErrorNames(
            { 'content[b1].cta': ['Required'] },
            definitions,
            (label) => (typeof label === 'string' ? label : label.$t)
        );
        expect(names).toEqual(['content[b1].cta']);
    });
});
