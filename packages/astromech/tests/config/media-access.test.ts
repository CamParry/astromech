/**
 * `media.access` resolution and the boot-time incompatibility check (spec §8.4).
 */

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/config/resolve';
import { cloudflareImages } from '@/media/serving/image/drivers/cloudflare';
import type {
    AstromechConfig,
    DatabaseDriver,
    ImageDriver,
    MediaConfig,
    StorageDriver,
} from '@/types/index';

const dbDriver: DatabaseDriver = {
    type: 'test',
    getInstance() {
        throw new Error('not called');
    },
    createDialect() {
        throw new Error('not called');
    },
};

const storageDriver: StorageDriver = {
    name: 'noop',
    async put() {
        return undefined;
    },
    async get() {
        return null;
    },
    async stat() {
        return null;
    },
    async delete() {
        return undefined;
    },
    async list() {
        return { keys: [] };
    },
};

/**
 * Stands in for `sharp()` — the real factory pulls in the native library, and
 * all that matters here is a driver whose name is not the Cloudflare one.
 */
const sharpLike: ImageDriver = {
    name: 'sharp',
    async transform() {
        throw new Error('not called');
    },
};

const configWith = (
    media: MediaConfig | undefined,
    image?: ImageDriver
): AstromechConfig => {
    // An image driver alone still needs a `media` object to hang off, so the
    // absent-media case grows one rather than dropping the driver.
    const resolvedMedia: MediaConfig | undefined =
        image === undefined ? media : { ...media, image: { driver: image } };
    return {
        db: dbDriver,
        storage: storageDriver,
        entries: {},
        ...(resolvedMedia === undefined ? {} : { media: resolvedMedia }),
    };
};

describe('resolveConfig media.access', () => {
    it("defaults to 'public' when media is absent", () => {
        expect(resolveConfig(configWith(undefined)).media.access).toBe('public');
    });

    it("defaults to 'public' when media is present without access", () => {
        const resolved = resolveConfig(configWith({ fields: [] }));
        expect(resolved.media.access).toBe('public');
        expect(resolved.media.fields).toEqual([]);
    });

    it('carries an explicit access through, alongside the other media config', () => {
        const resolved = resolveConfig(
            configWith({ access: 'private', fields: [{ name: 'credit', type: 'text' }] })
        );
        expect(resolved.media.access).toBe('private');
        expect(resolved.media.fields).toHaveLength(1);
    });
});

describe('resolveConfig media.access × image driver', () => {
    it("throws on 'private' + the Cloudflare Images driver", () => {
        expect(() =>
            resolveConfig(configWith({ access: 'private' }, cloudflareImages()))
        ).toThrow(/\[Astromech\].*cloudflare-images/s);
    });

    it('names both ways out in the error', () => {
        let message = '';
        try {
            resolveConfig(configWith({ access: 'private' }, cloudflareImages()));
        } catch (err) {
            message = err instanceof Error ? err.message : String(err);
        }
        expect(message).toContain("media.access: 'public'");
        expect(message).toContain('different image driver');
    });

    it("does not throw on 'private' + a non-Cloudflare driver", () => {
        expect(() =>
            resolveConfig(configWith({ access: 'private' }, sharpLike))
        ).not.toThrow();
    });

    it("does not throw on 'public' + the Cloudflare Images driver", () => {
        expect(() =>
            resolveConfig(configWith({ access: 'public' }, cloudflareImages()))
        ).not.toThrow();
    });
});
