import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            // SDK modules import `virtual:astromech/config`, injected by the Astro
            // integration at build time. Under vitest there is no integration, so
            // alias it to the CLI shim — a live Proxy over the globalThis config
            // populated by `setCliConfig` (see src/test/harness.ts).
            'virtual:astromech/config': fileURLToPath(
                new URL('./src/cli/virtual-config-shim.ts', import.meta.url)
            ),
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
});
