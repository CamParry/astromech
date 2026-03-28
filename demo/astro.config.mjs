import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { astromech } from 'astromech/astro';
import astromechConfig from './astromech.config.ts';

export default defineConfig({
    server: {
        port: 4323,
    },
    devToolbar: {
        enabled: false,
    },
    integrations: [react(), astromech(astromechConfig)],
});
