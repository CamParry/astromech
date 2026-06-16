import { describe, expect, it } from 'vitest';
import { buildImageAttrs } from './build-image-attrs.js';
import type { ImageAttrsContext, ImageAttrsInput } from './build-image-attrs.js';

const MEDIA_ROUTE = '/_media';

const jpegInput: ImageAttrsInput = {
    id: 'img-abc',
    filename: 'hero.jpg',
    mimeType: 'image/jpeg',
    width: 1600,
    height: 900,
    version: 'v1',
    blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
};

const ctx: ImageAttrsContext = {
    mediaRoute: MEDIA_ROUTE,
    widths: [320, 640, 1280],
    avif: true,
};

describe('buildImageAttrs — optimisable JPEG, avif:true, intrinsic 1600', () => {
    const result = buildImageAttrs(jpegInput, {}, ctx);

    it('produces 2 sources (avif then webp)', () => {
        expect(result.sources).toHaveLength(2);
        const [avif, webp] = result.sources;
        expect(avif?.type).toBe('image/avif');
        expect(webp?.type).toBe('image/webp');
    });

    it('each srcset has 3 entries', () => {
        for (const source of result.sources) {
            const entries = source.srcset.split(', ');
            expect(entries).toHaveLength(3);
        }
    });

    it('srcset entries have correct width descriptor shape', () => {
        const [avifSource] = result.sources;
        const entries = avifSource?.srcset.split(', ') ?? [];
        expect(entries[0]).toMatch(/320w$/);
        expect(entries[1]).toMatch(/640w$/);
        expect(entries[2]).toMatch(/1280w$/);
    });

    it('srcset URLs contain v=v1', () => {
        for (const source of result.sources) {
            for (const entry of source.srcset.split(', ')) {
                expect(entry).toContain('v=v1');
            }
        }
    });

    it('avif srcset URLs include f=avif', () => {
        const [avifSource] = result.sources;
        for (const entry of (avifSource?.srcset ?? '').split(', ')) {
            expect(entry).toContain('f=avif');
        }
    });

    it('webp srcset URLs include f=webp', () => {
        const [, webpSource] = result.sources;
        for (const entry of (webpSource?.srcset ?? '').split(', ')) {
            expect(entry).toContain('f=webp');
        }
    });

    it('img.src is the bare original URL', () => {
        expect(result.img.src).toBe('/_media/img-abc.jpg');
    });

    it('passes through intrinsic dimensions', () => {
        expect(result.img.width).toBe(1600);
        expect(result.img.height).toBe(900);
    });

    it('passes through blurhash', () => {
        expect(result.blurhash).toBe('LKO2?U%2Tw=w]~RBVZRi};RPxuwH');
    });

    it('sizes defaults to 100vw', () => {
        expect(result.img.sizes).toBe('100vw');
        const [first] = result.sources;
        expect(first?.sizes).toBe('100vw');
    });
});

describe('buildImageAttrs — ladder capped at intrinsic width', () => {
    it('intrinsic 800 → ladder [320, 640] only', () => {
        const input: ImageAttrsInput = { ...jpegInput, width: 800 };
        const result = buildImageAttrs(input, {}, ctx);
        const [avifSource] = result.sources;
        const entries = avifSource?.srcset.split(', ') ?? [];
        expect(entries).toHaveLength(2);
        expect(entries[0]).toContain('w=320');
        expect(entries[1]).toContain('w=640');
    });
});

describe('buildImageAttrs — avif:false', () => {
    it('produces only the webp source', () => {
        const noAvifCtx: ImageAttrsContext = { ...ctx, avif: false };
        const result = buildImageAttrs(jpegInput, {}, noAvifCtx);
        expect(result.sources).toHaveLength(1);
        const [first] = result.sources;
        expect(first?.type).toBe('image/webp');
    });
});

describe('buildImageAttrs — non-optimisable types', () => {
    const cases: [string, string, string][] = [
        ['image/svg+xml', 'icon.svg', 'SVG'],
        ['application/pdf', 'doc.pdf', 'PDF'],
        ['video/mp4', 'clip.mp4', 'video'],
        ['image/gif', 'anim.gif', 'GIF'],
    ];

    for (const [mimeType, filename, label] of cases) {
        it(`${label} → sources:[] and bare img.src`, () => {
            const input: ImageAttrsInput = {
                ...jpegInput,
                mimeType,
                filename,
            };
            const result = buildImageAttrs(input, {}, ctx);
            expect(result.sources).toEqual([]);
            const ext = filename.split('.').pop();
            expect(result.img.src).toBe(`/_media/img-abc.${ext}`);
        });
    }
});

describe('buildImageAttrs — missing version → bare img', () => {
    it('no version → sources:[]', () => {
        const input: ImageAttrsInput = { ...jpegInput, version: null };
        const result = buildImageAttrs(input, {}, ctx);
        expect(result.sources).toEqual([]);
        expect(result.img.src).toBe('/_media/img-abc.jpg');
    });
});

describe('buildImageAttrs — intrinsic smaller than all allowlist widths → bare img', () => {
    it('intrinsic 200 → ladder empty → sources:[]', () => {
        const input: ImageAttrsInput = { ...jpegInput, width: 200 };
        const result = buildImageAttrs(input, {}, ctx);
        expect(result.sources).toEqual([]);
        expect(result.img.src).toBe('/_media/img-abc.jpg');
    });
});

describe('buildImageAttrs — sizes override', () => {
    it('propagates custom sizes to sources and img', () => {
        const result = buildImageAttrs(
            jpegInput,
            { sizes: '(min-width: 768px) 50vw, 100vw' },
            ctx
        );
        expect(result.img.sizes).toBe('(min-width: 768px) 50vw, 100vw');
        for (const source of result.sources) {
            expect(source.sizes).toBe('(min-width: 768px) 50vw, 100vw');
        }
    });
});

describe('buildImageAttrs — per-call widths override', () => {
    it('options.widths overrides ctx.widths', () => {
        const result = buildImageAttrs(jpegInput, { widths: [480, 960] }, ctx);
        const [avifSource] = result.sources;
        const entries = avifSource?.srcset.split(', ') ?? [];
        expect(entries).toHaveLength(2);
        expect(entries[0]).toContain('w=480');
        expect(entries[1]).toContain('w=960');
    });
});
