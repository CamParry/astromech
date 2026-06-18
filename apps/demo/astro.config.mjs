import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import { astromech } from 'astromech/astro';
import astromechConfig from './astromech.config.ts';
import icon from 'astro-icon';

export default defineConfig({
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
        astromech(astromechConfig),
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
