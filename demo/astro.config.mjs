import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { astromech } from 'astromech/astro';
import astromechConfig from './astromech.config.ts';

export default defineConfig({
    devToolbar: {
        enabled: false,
    },
    integrations: [
        react(),
        astromech(astromechConfig),
    ],
});
