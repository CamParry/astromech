import { describe, expect, it } from 'vitest';
import {
    buildMediaUrl,
    buildVariantUrl,
    isAllowedWidth,
    isImageFormat,
    normaliseWidths,
    parseImageParams,
    variantPrefix,
    variantStorageKey,
    widthLadder,
} from '@/media/serving/image/url.js';

describe('buildMediaUrl', () => {
    it('produces the canonical original URL', () => {
        expect(buildMediaUrl('/_media', 'abc123', 'jpg')).toBe('/_media/abc123.jpg');
    });

    it('works with a custom route', () => {
        expect(buildMediaUrl('/uploads', 'xyz', 'png')).toBe('/uploads/xyz.png');
    });
});

describe('buildVariantUrl', () => {
    it('produces the canonical versioned variant URL', () => {
        expect(
            buildVariantUrl('/_media', 'abc', 'jpg', {
                width: 640,
                format: 'webp',
                version: '9',
            })
        ).toBe('/_media/abc.jpg?w=640&f=webp&v=9');
    });

    it('works with avif format', () => {
        expect(
            buildVariantUrl('/_media', 'img1', 'png', {
                width: 1280,
                format: 'avif',
                version: 'v2',
            })
        ).toBe('/_media/img1.png?w=1280&f=avif&v=v2');
    });
});

describe('parseImageParams', () => {
    it('parses valid w, f, v', () => {
        const p = parseImageParams(new URLSearchParams('w=640&f=webp&v=abc'));
        expect(p).toEqual({ width: 640, format: 'webp', version: 'abc' });
    });

    it('parses avif format', () => {
        const p = parseImageParams(new URLSearchParams('w=1280&f=avif&v=1'));
        expect(p).toEqual({ width: 1280, format: 'avif', version: '1' });
    });

    it('returns all nulls when params are absent', () => {
        const p = parseImageParams(new URLSearchParams(''));
        expect(p).toEqual({ width: null, format: null, version: null });
    });

    it('returns partial result when only v is present', () => {
        const p = parseImageParams(new URLSearchParams('v=abc123'));
        expect(p).toEqual({ width: null, format: null, version: 'abc123' });
    });

    it('rejects NaN width', () => {
        const p = parseImageParams(new URLSearchParams('w=foo&f=webp&v=1'));
        expect(p.width).toBeNull();
    });

    it('rejects zero width', () => {
        const p = parseImageParams(new URLSearchParams('w=0&f=webp&v=1'));
        expect(p.width).toBeNull();
    });

    it('rejects negative width', () => {
        const p = parseImageParams(new URLSearchParams('w=-100&f=webp&v=1'));
        expect(p.width).toBeNull();
    });

    it('rejects non-integer width', () => {
        const p = parseImageParams(new URLSearchParams('w=640.5&f=webp&v=1'));
        expect(p.width).toBeNull();
    });

    it('rejects unknown format', () => {
        const p = parseImageParams(new URLSearchParams('w=640&f=jpeg&v=1'));
        expect(p.format).toBeNull();
    });

    it('rejects empty format', () => {
        const p = parseImageParams(new URLSearchParams('w=640&f=&v=1'));
        expect(p.format).toBeNull();
    });

    it('returns null version for empty v param', () => {
        const p = parseImageParams(new URLSearchParams('w=640&f=webp&v='));
        expect(p.version).toBeNull();
    });
});

describe('isImageFormat', () => {
    it('accepts avif', () => {
        expect(isImageFormat('avif')).toBe(true);
    });

    it('accepts webp', () => {
        expect(isImageFormat('webp')).toBe(true);
    });

    it('rejects jpeg', () => {
        expect(isImageFormat('jpeg')).toBe(false);
    });

    it('rejects png', () => {
        expect(isImageFormat('png')).toBe(false);
    });

    it('rejects empty string', () => {
        expect(isImageFormat('')).toBe(false);
    });
});

describe('isAllowedWidth', () => {
    const allowlist = [320, 640, 1280] as const;

    it('returns true for an allowlisted width', () => {
        expect(isAllowedWidth(640, allowlist)).toBe(true);
    });

    it('returns false for a non-allowlisted width', () => {
        expect(isAllowedWidth(800, allowlist)).toBe(false);
    });

    it('returns false for zero', () => {
        expect(isAllowedWidth(0, allowlist)).toBe(false);
    });

    it('returns true for first entry', () => {
        expect(isAllowedWidth(320, allowlist)).toBe(true);
    });
});

describe('variantStorageKey', () => {
    it('produces the correct storage key', () => {
        expect(variantStorageKey('abc123', 'v1', 640, 'webp')).toBe(
            'variants/abc123/v1/640.webp'
        );
    });

    it('works for avif', () => {
        expect(variantStorageKey('img-id', 'hash9', 1280, 'avif')).toBe(
            'variants/img-id/hash9/1280.avif'
        );
    });
});

describe('variantPrefix', () => {
    it('produces the prefix with trailing slash', () => {
        expect(variantPrefix('abc123')).toBe('variants/abc123/');
    });
});

describe('normaliseWidths', () => {
    it('deduplicates widths', () => {
        expect(normaliseWidths([640, 640, 1280])).toEqual([640, 1280]);
    });

    it('sorts ascending', () => {
        expect(normaliseWidths([1280, 320, 640])).toEqual([320, 640, 1280]);
    });

    it('dedupes and sorts together', () => {
        expect(normaliseWidths([1280, 640, 320, 640, 1280])).toEqual([320, 640, 1280]);
    });

    it('handles empty input', () => {
        expect(normaliseWidths([])).toEqual([]);
    });
});

describe('widthLadder', () => {
    const allowlist = [320, 640, 1280, 1920];

    it('caps at intrinsic width (never upscales)', () => {
        expect(widthLadder(allowlist, 800)).toEqual([320, 640]);
    });

    it('includes exact intrinsic match', () => {
        expect(widthLadder(allowlist, 1280)).toEqual([320, 640, 1280]);
    });

    it('returns all widths when intrinsic is larger than all', () => {
        expect(widthLadder(allowlist, 2560)).toEqual([320, 640, 1280, 1920]);
    });

    it('returns [intrinsicWidth] when every allowlist width exceeds intrinsic', () => {
        expect(widthLadder(allowlist, 200)).toEqual([200]);
    });

    it('dedupes and sorts the allowlist before filtering', () => {
        expect(widthLadder([1280, 640, 640, 320], 640)).toEqual([320, 640]);
    });
});
