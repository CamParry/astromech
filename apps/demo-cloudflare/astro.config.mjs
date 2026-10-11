import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { astromech } from 'astromech/astro';

export default defineConfig({
    site: 'https://demo-cloudflare.astromech.dev',
    output: 'server',
    adapter: cloudflare(),
    // Astromech does not use Astro sessions. Left on, the adapter adds a
    // `SESSION` KV binding, and `wrangler deploy` creates a namespace for it.
    session: false,
    // Astro's route cache, stored by Workers Caching (`cache` in
    // `wrangler.jsonc`). Every page may be stored for a minute, so the rule
    // reaches Astromech's own routes too, and `cache.set(false)` is what keeps
    // the admin, the API and a preview read out (`check:deployed:cloudflare`).
    cache: { provider: cacheCloudflare() },
    routeRules: { '/[...path]': { maxAge: 60 } },
    server: {
        port: 4324,
    },
    devToolbar: {
        enabled: false,
    },
    integrations: [astromech(), react()],
});
