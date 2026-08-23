import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { astromech } from 'astromech/astro';

export default defineConfig({
    site: 'https://demo-cloudflare.astromech.dev',
    output: 'server',
    adapter: cloudflare(),
    server: {
        port: 4324,
    },
    devToolbar: {
        enabled: false,
    },
    integrations: [react(), astromech()],
});
