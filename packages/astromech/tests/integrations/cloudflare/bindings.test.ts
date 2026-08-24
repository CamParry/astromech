import { beforeEach, describe, expect, it } from 'vitest';
import { clearEnvSource, setEnvSource } from '@/env';
import { resetBindings, resolveBinding } from '@/integrations/cloudflare/bindings';

// Every test here registers an environment through `setEnvSource`, the way a
// Worker entry does, so nothing in this file starts a runtime. The wrangler
// fallback is covered by `d1-local-emulation.test.ts`, which boots workerd.
//
// Leaving the source unset falls through to wrangler and boots workerd,
// because this package depends on it — a real resolution.

describe('resolveBinding()', () => {
    beforeEach(() => {
        clearEnvSource();
        resetBindings();
    });

    it('resolves a binding supplied via setEnvSource', async () => {
        const bucket = { name: 'fake-bucket' };
        setEnvSource({ MEDIA: bucket });

        const resolved = await resolveBinding('MEDIA');
        expect(resolved).toBe(bucket);
    });

    it('throws for an unknown binding, listing the available ones', async () => {
        setEnvSource({ DB: {}, ASSETS: {} });

        await expect(resolveBinding('MEDIA')).rejects.toThrow(
            "Cloudflare binding 'MEDIA' not found. Available bindings: DB, ASSETS."
        );
    });

    it('says "(none)" when the env is empty', async () => {
        setEnvSource({});

        await expect(resolveBinding('MEDIA')).rejects.toThrow(
            "Cloudflare binding 'MEDIA' not found. Available bindings: (none)."
        );
    });

    it('hands back the same binding instance across calls', async () => {
        const bucket = { name: 'fake-bucket' };
        setEnvSource({ MEDIA: bucket });

        const [first, second] = await Promise.all([
            resolveBinding('MEDIA'),
            resolveBinding('MEDIA'),
        ]);
        expect(first).toBe(bucket);
        expect(second).toBe(bucket);
    });

    it('does not memoise a failed lookup', async () => {
        setEnvSource({ OTHER: {} });
        await expect(resolveBinding('MEDIA')).rejects.toThrow(/not found/);

        // A recoverable failure: supplying an env afterwards must still work.
        setEnvSource({ MEDIA: { name: 'recovered' } });
        expect(await resolveBinding('MEDIA')).toEqual({ name: 'recovered' });
    });

    it('re-resolves after the source is cleared', async () => {
        setEnvSource({ MEDIA: { name: 'first' } });
        expect(await resolveBinding('MEDIA')).toEqual({ name: 'first' });

        clearEnvSource();
        resetBindings();
        setEnvSource({ MEDIA: { name: 'second' } });
        expect(await resolveBinding('MEDIA')).toEqual({ name: 'second' });
    });
});
