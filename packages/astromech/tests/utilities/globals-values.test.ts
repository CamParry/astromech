import { describe, expect, it } from 'vitest';
import {
    partitionGlobalValues,
    mergeGlobalValues,
    mergeLocaleSetting,
} from '@/settings/index.js';
import type { ResolvedEntryFields } from '@/types/fields.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fields(
    main: ResolvedEntryFields['main'],
    sidebar: ResolvedEntryFields['sidebar'] = []
): ResolvedEntryFields {
    return { main, sidebar };
}

// ---------------------------------------------------------------------------
// partitionGlobalValues
// ---------------------------------------------------------------------------

describe('partitionGlobalValues', () => {
    describe('non-translatable top-level fields', () => {
        it('routes translatable:false to shared', () => {
            const schema = fields([{ name: 'logo', type: 'media', translatable: false }]);
            const result = partitionGlobalValues(schema, { logo: 'img.png' });
            expect(result.shared).toEqual({ logo: 'img.png' });
            expect(result.perLocale).toEqual({});
        });

        it('routes multiple non-translatable fields to shared', () => {
            const schema = fields([
                { name: 'logo', type: 'media', translatable: false },
                { name: 'theme', type: 'select', translatable: false },
            ]);
            const result = partitionGlobalValues(schema, {
                logo: 'img.png',
                theme: 'dark',
            });
            expect(result.shared).toEqual({ logo: 'img.png', theme: 'dark' });
            expect(result.perLocale).toEqual({});
        });
    });

    describe('translatable top-level fields', () => {
        it('routes translatable:true to perLocale', () => {
            const schema = fields([
                { name: 'tagline', type: 'text', translatable: true },
            ]);
            const result = partitionGlobalValues(schema, { tagline: 'Hello' });
            expect(result.shared).toEqual({});
            expect(result.perLocale).toEqual({ tagline: 'Hello' });
        });

        it('routes fields with no translatable flag to perLocale (default)', () => {
            const schema = fields([{ name: 'title', type: 'text' }]);
            const result = partitionGlobalValues(schema, { title: 'My Site' });
            expect(result.shared).toEqual({});
            expect(result.perLocale).toEqual({ title: 'My Site' });
        });

        it('routes unknown keys (not in schema) to perLocale (safe default)', () => {
            const schema = fields([{ name: 'title', type: 'text' }]);
            const result = partitionGlobalValues(schema, { title: 'X', unknown: 'Y' });
            expect(result.shared).toEqual({});
            expect(result.perLocale).toEqual({ title: 'X', unknown: 'Y' });
        });
    });

    describe('mixed fields split correctly', () => {
        it('separates translatable and non-translatable in one pass', () => {
            const schema = fields([
                { name: 'name', type: 'text' },
                { name: 'logo', type: 'media', translatable: false },
                { name: 'tagline', type: 'text', translatable: true },
            ]);
            const result = partitionGlobalValues(schema, {
                name: 'Acme',
                logo: 'logo.png',
                tagline: 'Hello',
            });
            expect(result.shared).toEqual({ logo: 'logo.png' });
            expect(result.perLocale).toEqual({ name: 'Acme', tagline: 'Hello' });
        });

        it('handles fields across main and sidebar', () => {
            const schema = fields(
                [{ name: 'title', type: 'text' }],
                [{ name: 'logo', type: 'media', translatable: false }]
            );
            const result = partitionGlobalValues(schema, { title: 'T', logo: 'l.png' });
            expect(result.shared).toEqual({ logo: 'l.png' });
            expect(result.perLocale).toEqual({ title: 'T' });
        });
    });

    describe('data containers (group/repeater/blocks) treated as single top-level key', () => {
        it('group partitioned by its own translatable flag (false → shared)', () => {
            const schema = fields([
                {
                    name: 'address',
                    type: 'group',
                    translatable: false,
                    fields: [
                        { name: 'street', type: 'text' },
                        { name: 'city', type: 'text' },
                    ],
                },
            ]);
            // Only the top-level key "address" is submitted as a unit
            const result = partitionGlobalValues(schema, {
                address: { street: '1 Main St', city: 'Springfield' },
            });
            expect(result.shared).toEqual({
                address: { street: '1 Main St', city: 'Springfield' },
            });
            expect(result.perLocale).toEqual({});
        });

        it('group partitioned by its own translatable flag (absent → perLocale)', () => {
            const schema = fields([
                {
                    name: 'address',
                    type: 'group',
                    fields: [{ name: 'street', type: 'text' }],
                },
            ]);
            const result = partitionGlobalValues(schema, {
                address: { street: '1 Main St' },
            });
            expect(result.shared).toEqual({});
            expect(result.perLocale).toEqual({ address: { street: '1 Main St' } });
        });

        it('repeater treated as single key partitioned by container flag', () => {
            const schema = fields([
                {
                    name: 'links',
                    type: 'repeater',
                    translatable: false,
                    fields: [{ name: 'url', type: 'url' }],
                },
            ]);
            const result = partitionGlobalValues(schema, {
                links: [{ url: 'https://example.com' }],
            });
            expect(result.shared).toEqual({ links: [{ url: 'https://example.com' }] });
            expect(result.perLocale).toEqual({});
        });

        it('blocks treated as single key partitioned by container flag', () => {
            const schema = fields([{ name: 'content', type: 'blocks', blocks: [] }]);
            const result = partitionGlobalValues(schema, { content: [] });
            expect(result.shared).toEqual({});
            expect(result.perLocale).toEqual({ content: [] });
        });
    });

    describe('layout containers (section/tabs/accordion) are transparent — children partition individually', () => {
        it('fields inside a section partition by their own flag', () => {
            const schema = fields([
                {
                    name: 'branding',
                    type: 'section',
                    fields: [
                        { name: 'logo', type: 'media', translatable: false },
                        { name: 'tagline', type: 'text' },
                    ],
                },
            ]);
            const result = partitionGlobalValues(schema, {
                logo: 'l.png',
                tagline: 'Hi',
            });
            expect(result.shared).toEqual({ logo: 'l.png' });
            expect(result.perLocale).toEqual({ tagline: 'Hi' });
        });

        it('fields inside tabs/tab are unwrapped and partition individually', () => {
            const schema = fields([
                {
                    name: 'tabs',
                    type: 'tabs',
                    fields: [
                        {
                            name: 'tab1',
                            type: 'tab',
                            fields: [
                                { name: 'logo', type: 'media', translatable: false },
                                { name: 'name', type: 'text' },
                            ],
                        },
                    ],
                },
            ]);
            const result = partitionGlobalValues(schema, { logo: 'l.png', name: 'Acme' });
            expect(result.shared).toEqual({ logo: 'l.png' });
            expect(result.perLocale).toEqual({ name: 'Acme' });
        });

        it('fields inside accordion are unwrapped and partition individually', () => {
            const schema = fields([
                {
                    name: 'panel',
                    type: 'accordion',
                    fields: [
                        { name: 'logo', type: 'media', translatable: false },
                        { name: 'bio', type: 'textarea' },
                    ],
                },
            ]);
            const result = partitionGlobalValues(schema, {
                logo: 'l.png',
                bio: 'About us',
            });
            expect(result.shared).toEqual({ logo: 'l.png' });
            expect(result.perLocale).toEqual({ bio: 'About us' });
        });

        it('nested layout containers are fully unwrapped', () => {
            const schema = fields([
                {
                    name: 'outer',
                    type: 'section',
                    fields: [
                        {
                            name: 'inner',
                            type: 'section',
                            fields: [
                                { name: 'logo', type: 'media', translatable: false },
                                { name: 'title', type: 'text' },
                            ],
                        },
                    ],
                },
            ]);
            const result = partitionGlobalValues(schema, { logo: 'l.png', title: 'T' });
            expect(result.shared).toEqual({ logo: 'l.png' });
            expect(result.perLocale).toEqual({ title: 'T' });
        });
    });

    describe('empty inputs', () => {
        it('returns empty objects for empty values', () => {
            const schema = fields([{ name: 'title', type: 'text' }]);
            const result = partitionGlobalValues(schema, {});
            expect(result.shared).toEqual({});
            expect(result.perLocale).toEqual({});
        });

        it('returns empty objects for empty schema', () => {
            const schema = fields([]);
            const result = partitionGlobalValues(schema, { title: 'T' });
            expect(result.shared).toEqual({});
            expect(result.perLocale).toEqual({ title: 'T' });
        });
    });
});

// ---------------------------------------------------------------------------
// mergeGlobalValues
// ---------------------------------------------------------------------------

describe('mergeGlobalValues', () => {
    it('merges shared and perLocale', () => {
        const result = mergeGlobalValues({ logo: 'l.png' }, { title: 'T' });
        expect(result).toEqual({ logo: 'l.png', title: 'T' });
    });

    it('per-locale wins on key conflict', () => {
        const result = mergeGlobalValues({ title: 'shared' }, { title: 'locale' });
        expect(result).toEqual({ title: 'locale' });
    });

    it('handles null shared', () => {
        const result = mergeGlobalValues(null, { title: 'T' });
        expect(result).toEqual({ title: 'T' });
    });

    it('handles null perLocale', () => {
        const result = mergeGlobalValues({ logo: 'l.png' }, null);
        expect(result).toEqual({ logo: 'l.png' });
    });

    it('handles both null', () => {
        const result = mergeGlobalValues(null, null);
        expect(result).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// mergeLocaleSetting
// ---------------------------------------------------------------------------

describe('mergeLocaleSetting', () => {
    it('should merge two plain objects with locale values winning on conflict', () => {
        const result = mergeLocaleSetting(
            { siteName: 'Acme', logo: 'logo.png' },
            { siteName: 'Acme FR' }
        );
        expect(result).toEqual({ siteName: 'Acme FR', logo: 'logo.png' });
    });

    it('should return base when locale value is null', () => {
        const result = mergeLocaleSetting({ siteName: 'Acme' }, null);
        expect(result).toEqual({ siteName: 'Acme' });
    });

    it('should return base when locale value is undefined', () => {
        const result = mergeLocaleSetting({ siteName: 'Acme' }, undefined);
        expect(result).toEqual({ siteName: 'Acme' });
    });

    it('should return base unchanged when base is a scalar string, even if locale value exists', () => {
        const result = mergeLocaleSetting('some-string', { title: 'X' });
        expect(result).toBe('some-string');
    });

    it('should return base unchanged when base is a number', () => {
        const result = mergeLocaleSetting(42, { title: 'X' });
        expect(result).toBe(42);
    });

    it('should return base unchanged when base is a boolean', () => {
        const result = mergeLocaleSetting(true, { title: 'X' });
        expect(result).toBe(true);
    });

    it('should return null base unchanged when locale value exists', () => {
        const result = mergeLocaleSetting(null, { title: 'X' });
        expect(result).toBeNull();
    });

    it('should return base unchanged when base is an array (not a plain object)', () => {
        const result = mergeLocaleSetting([1, 2, 3], { title: 'X' });
        expect(result).toEqual([1, 2, 3]);
    });

    it('should return base unchanged when locale value is an array (not a plain object)', () => {
        const result = mergeLocaleSetting({ title: 'Acme' }, [1, 2, 3]);
        expect(result).toEqual({ title: 'Acme' });
    });

    it('should add locale-only keys to the merged result', () => {
        const result = mergeLocaleSetting({ logo: 'logo.png' }, { tagline: 'Hello' });
        expect(result).toEqual({ logo: 'logo.png', tagline: 'Hello' });
    });

    it('should return an empty object when both base and locale value are empty objects', () => {
        const result = mergeLocaleSetting({}, {});
        expect(result).toEqual({});
    });
});
