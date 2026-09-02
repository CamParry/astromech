import type { GlobalConfig } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { defineGlobal } from '@/config/define-global';
import { resolveGlobals, toResolvedGlobal } from '@/config/globals';

const site = (overrides: Partial<GlobalConfig> = {}): GlobalConfig =>
    defineGlobal({
        key: 'site',
        label: 'Site',
        fields: [{ name: 'tagline', type: 'text' }],
        ...overrides,
    });

describe('toResolvedGlobal — capability defaults', () => {
    it('defaults statuses and versioning on, translatable and staging off', () => {
        const resolved = toResolvedGlobal('site', site());

        expect(resolved.capabilities).toEqual({
            statuses: true,
            translatable: false,
            versioning: true,
            staging: false,
        });
    });

    it('turns versioning off when the author writes false', () => {
        expect(
            toResolvedGlobal('site', site({ versioning: false })).capabilities.versioning
        ).toBe(false);
    });

    it('keeps the authored versioning object alongside the capability', () => {
        const resolved = toResolvedGlobal(
            'site',
            site({ versioning: { maxVersions: 5 } })
        );

        expect(resolved.capabilities.versioning).toBe(true);
        expect(resolved.versioning).toEqual({ maxVersions: 5 });
    });

    it('honours explicit translatable, statuses and staging', () => {
        const resolved = toResolvedGlobal(
            'site',
            site({ translatable: true, statuses: true, staging: true })
        );

        expect(resolved.capabilities).toEqual({
            statuses: true,
            translatable: true,
            versioning: true,
            staging: true,
        });
    });
});

describe('toResolvedGlobal — shape', () => {
    it('stamps the id, resolves the field tree and strips key and fields', () => {
        const resolved = toResolvedGlobal('seo/settings', site({ key: 'settings' }));

        expect(resolved.id).toBe('seo/settings');
        expect(resolved.fields).toEqual({
            main: [{ name: 'tagline', type: 'text' }],
            sidebar: [],
        });
        expect(resolved).not.toHaveProperty('key');
    });
});

describe('assertGlobalValid — via toResolvedGlobal', () => {
    it('rejects a key containing "/"', () => {
        expect(() =>
            toResolvedGlobal('seo/settings', site({ key: 'seo/settings' }))
        ).toThrow(/must not contain "\/" or ":"/);
    });

    it('rejects a key containing ":"', () => {
        expect(() => toResolvedGlobal('site:en', site({ key: 'site:en' }))).toThrow(
            /must not contain "\/" or ":"/
        );
    });

    it('rejects an empty key', () => {
        expect(() => toResolvedGlobal('', site({ key: '' }))).toThrow(/non-empty/);
    });

    it('rejects staging without statuses', () => {
        expect(() =>
            toResolvedGlobal('site', site({ staging: true, statuses: false }))
        ).toThrow(/"site".*`staging` requires `statuses`/s);
    });

    it('runs field-tree validation', () => {
        expect(() =>
            toResolvedGlobal(
                'site',
                site({
                    fields: [
                        { name: 'tagline', type: 'text' },
                        { name: 'tagline', type: 'number' },
                    ],
                })
            )
        ).toThrow(/tagline/);
    });
});

describe('resolveGlobals', () => {
    it('returns an empty map when nothing is declared', () => {
        expect(resolveGlobals(undefined)).toEqual({});
    });

    it('keys the resolved globals by their bare key', () => {
        const resolved = resolveGlobals([site(), site({ key: 'footer' })]);

        expect(Object.keys(resolved)).toEqual(['site', 'footer']);
        expect(resolved['footer']?.id).toBe('footer');
    });

    it('rejects a duplicate key, naming both positions', () => {
        expect(() => resolveGlobals([site(), site({ label: 'Site again' })])).toThrow(
            /the site config declares the global key "site" twice \(globals\[0\] and globals\[1\]\)/
        );
    });
});
