import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBinding, setBindingEnv, resetBindingEnv } from '@/cloudflare/bindings.js';

// The Workers (`cloudflare:workers`) and Node (`wrangler` getPlatformProxy())
// detection paths are intentionally not exercised here: neither package is
// installed and there is no `wrangler.jsonc` in this repo. Every test goes
// through `setBindingEnv`, the documented bypass for hosts (and tests) that
// already hold an `env` object.

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

    // The one runtime-detection branch that IS reachable here: with no env set
    // and no Workers global, detection falls through to wrangler — which this
    // repo deliberately does not depend on.
    it('explains how to fix a missing wrangler when detection falls to Node', async () => {
        await expect(resolveBinding('MEDIA')).rejects.toThrow(
            /Resolving a Cloudflare binding outside a Worker needs wrangler/
        );
    });

    it('does not memoise a failed detection', async () => {
        await expect(resolveBinding('MEDIA')).rejects.toThrow(/needs wrangler/);

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
