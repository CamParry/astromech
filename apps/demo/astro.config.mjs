// This file is evaluated by plain Node before Vite, so `.env` has not reached
// `import.meta.env` yet. `SITE_URL` is read from `process.env`, which this fills.
import 'dotenv/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';
import { astromech } from 'astromech/astro';

export default defineConfig({
    // The deployment's own origin: canonical URLs, `og:url` and the sitemap all
    // read it via `Astro.site`. A deployment fact, so it lives in config/env and
    // never in settings (`decisions/globals-are-content-config-is-code.md`).
    site: process.env.SITE_URL ?? 'https://astromech.dev',
    output: 'server',
    // `SECURITY_CSP=1` sends Astro's default policy, which `check:boot` builds
    // with so its browser steps fail on anything the policy blocks.
    ...(process.env.SECURITY_CSP === '1' ? { security: { csp: true } } : {}),
    adapter: node({ mode: 'standalone' }),
    server: {
        port: 4323,
    },
    devToolbar: {
        enabled: false,
    },
    integrations: [
        astromech(),
        react(),
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
