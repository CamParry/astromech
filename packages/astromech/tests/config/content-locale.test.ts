/**
 * `defaultContentLocale`: the locale rows are tagged with when a call names
 * none, found by walking `defaultLocale` down its fallback chain.
 */

import type { ResolvedConfig } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { defaultContentLocale } from '@/config/content-locale';

function config(locales?: string[], defaultLocale?: string): ResolvedConfig {
    return { locales, defaultLocale } as unknown as ResolvedConfig;
}

describe('defaultContentLocale', () => {
    it('returns the default locale when it is configured', () => {
        expect(defaultContentLocale(config(['en', 'de'], 'de'))).toBe('de');
    });

    it('falls back from a regional tag to its language', () => {
        expect(defaultContentLocale(config(['en', 'de'], 'en-GB'))).toBe('en');
    });

    it('falls back to the first configured locale when the chain misses', () => {
        expect(defaultContentLocale(config(['fr', 'de'], 'en'))).toBe('fr');
    });

    it('answers `en` with no locales and no default', () => {
        expect(defaultContentLocale(config())).toBe('en');
    });
});
