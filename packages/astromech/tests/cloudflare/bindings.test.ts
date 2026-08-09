import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBinding, setBindingEnv, resetBindingEnv } from '@/cloudflare/bindings';

// Every test here goes through `setBindingEnv`, the documented bypass for hosts
// (and tests) that already hold an `env` object, so nothing in this file starts
// a runtime. Detection itself is covered elsewhere: the wrangler branch by
// `d1-local-emulation.test.ts`, which boots workerd; the `cloudflare:workers`
// branch by nothing, since that specifier only resolves inside a Worker.
//
// Leaving the env unset would now fall through to wrangler and boot workerd,
// because this package depends on it — that is a real resolution, not the
// failure it used to be.

describe('resolveBinding()', () => {
    beforeEach(() => {
        resetBindingEnv();
    });

    it('resolves a binding supplied via setBindingEnv', async () => {
        const bucket = { name: 'fake-bucket' };
        setBindingEnv({ MEDIA: bucket });

        const resolved = await resolveBinding('MEDIA');
        expect(resolved).toBe(bucket);
    });

    it('throws for an unknown binding, listing the available ones', async () => {
        setBindingEnv({ DB: {}, ASSETS: {} });

        await expect(resolveBinding('MEDIA')).rejects.toThrow(
            "[Astromech] Cloudflare binding 'MEDIA' not found. Available bindings: DB, ASSETS."
        );
    });

    it('says "(none)" when the env is empty', async () => {
        setBindingEnv({});

        await expect(resolveBinding('MEDIA')).rejects.toThrow(
            "[Astromech] Cloudflare binding 'MEDIA' not found. Available bindings: (none)."
        );
    });

    it('hands back the same binding instance across calls', async () => {
        const bucket = { name: 'fake-bucket' };
        setBindingEnv({ MEDIA: bucket });

        const [first, second] = await Promise.all([
            resolveBinding('MEDIA'),
            resolveBinding('MEDIA'),
        ]);
        expect(first).toBe(bucket);
        expect(second).toBe(bucket);
    });

    it('does not memoise a failed lookup', async () => {
        setBindingEnv({ OTHER: {} });
        await expect(resolveBinding('MEDIA')).rejects.toThrow(/not found/);

        // A recoverable failure: supplying an env afterwards must still work.
        setBindingEnv({ MEDIA: { name: 'recovered' } });
        expect(await resolveBinding('MEDIA')).toEqual({ name: 'recovered' });
    });

    it('re-resolves after resetBindingEnv', async () => {
        setBindingEnv({ MEDIA: { name: 'first' } });
        expect(await resolveBinding('MEDIA')).toEqual({ name: 'first' });

        resetBindingEnv();
        setBindingEnv({ MEDIA: { name: 'second' } });
        expect(await resolveBinding('MEDIA')).toEqual({ name: 'second' });
    });
});
