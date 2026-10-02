/**
 * RFC 4647 lookup from a display locale to the closest content locale: try
 * the whole tag, then drop one subtag at a time from the end.
 */

import { describe, expect, it } from 'vitest';
import { resolveContentLocale } from '@/utilities/locale';

describe('resolveContentLocale', () => {
    it.each([
        ['falls back from a region tag to its language', 'en-GB', ['en'], 'en'],
        ['prefers the exact tag over its language', 'en-GB', ['en-GB', 'en'], 'en-GB'],
        ['drops the region from a three-part tag', 'zh-Hant-TW', ['zh-Hant'], 'zh-Hant'],
        ['drops the region and script from a three-part tag', 'zh-Hant-TW', ['zh'], 'zh'],
        [
            'returns undefined when no tag in the chain is available',
            'fr-CA',
            ['en', 'de'],
            undefined,
        ],
        [
            'does not match a more specific tag than the one requested',
            'en',
            ['en-GB'],
            undefined,
        ],
    ])('%s', (_label, requested, available, expected) => {
        expect(resolveContentLocale(requested, available)).toBe(expected);
    });
});
