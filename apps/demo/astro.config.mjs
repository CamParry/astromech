// This file is evaluated by plain Node before Vite, so `.env` has not reached
// `import.meta.env` yet. `SITE_URL` is read from `process.env`, which this fills.
import 'dotenv/config';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import { astromech } from 'astromech/astro';
import icon from 'astro-icon';

export default defineConfig({
    // The deployment's own origin: canonical URLs, `og:url` and the sitemap all
    // read it via `Astro.site`. A deployment fact, so it lives in config/env and
    // never in settings (see decisions/0051).
    site: process.env.SITE_URL ?? 'https://astromech.dev',
    output: 'server',
    adapter: node({ mode: 'standalone' }),
    server: {
        port: 4323,
    },
    devToolbar: {
        enabled: false,
    },
    integrations: [
        react(),
        astromech(),
        icon({
            include: {
                lucide: ['*'],
                'simple-icons': ['*'],
            },
        }),
    ],
    vite: {
        plugins: [tailwindcss()],
    },
});
