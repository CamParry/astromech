/**
 * `resolveEntryUrl`, `resolveEntryPath` and their locale forms: an entry type's
 * `url` template filled from an entry, and the null answer for an entry whose
 * template names an empty token.
 */

import type { UrlEntry } from '@/entries/entry-url';
import { describe, expect, it } from 'vitest';
import {
    resolveEntryLocalePath,
    resolveEntryLocaleUrl,
    resolveEntryPath,
    resolveEntryUrl,
} from '@/entries/entry-url';

function entry(slug: string | null, fields: Record<string, unknown> = {}): UrlEntry {
    return { slug, fields };
}

describe('resolveEntryUrl', () => {
    it('fills the slug token in a relative template', () => {
        expect(resolveEntryUrl('/blog/{slug}', entry('hello'))).toBe('/blog/hello');
    });

    it('fills field tokens in an absolute template', () => {
        expect(
            resolveEntryUrl(
                'https://example.com/{category}/{slug}',
                entry('hello', { category: 'news' })
            )
        ).toBe('https://example.com/news/hello');
    });

    it('writes a non-string field value as text', () => {
        expect(resolveEntryUrl('/{year}/{slug}', entry('hello', { year: 2026 }))).toBe(
            '/2026/hello'
        );
    });

    it('answers null for a null slug', () => {
        expect(resolveEntryUrl('/blog/{slug}', entry(null))).toBeNull();
    });

    it('answers null for an empty slug', () => {
        expect(resolveEntryUrl('/blog/{slug}', entry(''))).toBeNull();
    });

    it('answers null for a missing field', () => {
        expect(resolveEntryUrl('/{category}/{slug}', entry('hello'))).toBeNull();
    });

    it('answers null for a null field', () => {
        expect(
            resolveEntryUrl('/{category}/{slug}', entry('hello', { category: null }))
        ).toBeNull();
    });

    it('answers null for an empty-string field', () => {
        expect(
            resolveEntryUrl('/{category}/{slug}', entry('hello', { category: '' }))
        ).toBeNull();
    });
});

describe('resolveEntryPath', () => {
    it('answers the path of a relative template', () => {
        expect(resolveEntryPath('/blog/{slug}', entry('hello'))).toBe('/blog/hello');
    });

    it('answers the path of an absolute template without its origin or query', () => {
        expect(
            resolveEntryPath('https://example.com/blog/{slug}?ref=feed', entry('hello'))
        ).toBe('/blog/hello');
    });

    it('answers null for an empty leading field rather than reading //hello as a host', () => {
        expect(resolveEntryPath('/{category}/{slug}', entry('hello'))).toBeNull();
    });

    it('answers null when the resolved value is not a URL', () => {
        expect(resolveEntryPath('http://[{slug}', entry('hello'))).toBeNull();
    });
});

describe('resolveEntryLocalePath', () => {
    const config = { locales: ['en', 'de'], defaultLocale: 'en-GB' };

    it.each([
        ['leaves the default content locale unprefixed', 'en', '/blog/hello'],
        ['prefixes another locale', 'de', '/de/blog/hello'],
    ])('%s', (_, locale, expected) => {
        expect(
            resolveEntryLocalePath('/blog/{slug}', { ...entry('hello'), locale }, config)
        ).toBe(expected);
    });

    it('answers null when the entry has no path', () => {
        expect(
            resolveEntryLocalePath(
                '/blog/{slug}',
                { ...entry(null), locale: 'de' },
                config
            )
        ).toBeNull();
    });
});

describe('resolveEntryLocaleUrl', () => {
    const config = { locales: ['fr', 'en'], defaultLocale: 'en-GB' };

    it.each([
        [
            'leaves the default content locale unprefixed',
            '/blog/{slug}',
            'en',
            '/blog/hello',
        ],
        ['prefixes another locale', '/blog/{slug}', 'fr', '/fr/blog/hello'],
        [
            "keeps an absolute template's origin and query",
            'https://example.com/blog/{slug}?ref=feed',
            'fr',
            'https://example.com/fr/blog/hello?ref=feed',
        ],
        [
            "keeps a protocol-relative template's host",
            '//cdn.example.com/{slug}',
            'fr',
            '//cdn.example.com/fr/hello',
        ],
    ])('%s', (_, template, locale, expected) => {
        expect(
            resolveEntryLocaleUrl(template, { ...entry('hello'), locale }, config)
        ).toBe(expected);
    });

    it('answers null when the entry has no URL', () => {
        expect(
            resolveEntryLocaleUrl(
                '/blog/{slug}',
                { ...entry(null), locale: 'fr' },
                config
            )
        ).toBeNull();
    });
});
