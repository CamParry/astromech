import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            // SDK modules import `virtual:astromech/config`, injected by the Astro
            // integration at build time. Under vitest there is no integration, so
            // alias it to the CLI shim — a live Proxy over the globalThis config
            // populated by `setCliConfig` (see tests/_support/harness.ts).
            'virtual:astromech/config': fileURLToPath(
                new URL('./src/transport/cli/virtual-config-shim.ts', import.meta.url)
            ),
            // Admin virtual modules, normally injected by the Astro integration.
            'virtual:astromech/admin-config': fileURLToPath(
                new URL('./tests/_support/admin-config-shim.ts', import.meta.url)
            ),
            'virtual:astromech/plugins/components': fileURLToPath(
                new URL('./tests/_support/plugins-components-shim.ts', import.meta.url)
            ),
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@tests': fileURLToPath(new URL('./tests/_support', import.meta.url)),
            // First-party plugin packages and the public subpaths they consume
            // resolve to source under vitest (no build step before tests). The
            // subpath aliases MUST precede the bare `astromech` alias so the
            // longest match wins.
            'astromech/fields': fileURLToPath(
                new URL('./src/exports/fields.ts', import.meta.url)
            ),
            'astromech/columns': fileURLToPath(
                new URL('./src/exports/columns.ts', import.meta.url)
            ),
            'astromech/plugin-kit': fileURLToPath(
                new URL('./src/exports/plugin-kit.ts', import.meta.url)
            ),
            '@astromech/menus': fileURLToPath(
                new URL('./packages/menus/src/index.ts', import.meta.url)
            ),
            astromech: fileURLToPath(new URL('./src/exports/index.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
});
