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
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
});
