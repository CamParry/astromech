import cloudflare from '@astrojs/cloudflare';
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
    server: {
        port: 4324,
    },
    devToolbar: {
        enabled: false,
    },
    integrations: [astromech(), react()],
});
