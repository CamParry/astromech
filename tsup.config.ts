import { defineConfig } from 'tsup';

export default defineConfig([
    // Library build — virtual:astromech/config is injected by the Astro integration at runtime
    {
        entry: {
            index: 'src/index.ts',
            'adapters/astro': 'src/adapters/astro.ts',
            'sdk/local/index': 'src/sdk/local/index.ts',
            'sdk/fetch/index': 'src/sdk/fetch/index.ts',
            middleware: 'src/middleware.ts',
            'db/schema': 'src/db/schema.ts',
            'admin/components/ui/index': 'src/admin/components/ui/index.ts',
            'email/index': 'src/email/index.ts',
        },
        format: ['esm'],
        dts: true,
        sourcemap: true,
        clean: true,
        external: ['astro', 'drizzle-orm', 'better-auth', 'react', 'virtual:astromech/config', 'virtual:astromech/admin-config'],
        treeshake: true,
    },
    // CLI build — virtual:astromech/config is shimmed with the live-config proxy
    {
        entry: {
            'cli/index': 'src/cli/index.ts',
        },
        format: ['esm'],
        dts: false,
        sourcemap: true,
        clean: false,
        external: ['astro', 'drizzle-orm', 'better-auth', 'virtual:astromech/admin-config'],
        treeshake: true,
        banner: { js: '#!/usr/bin/env node' },
        esbuildOptions(options) {
            options.alias = {
                'virtual:astromech/config': './src/cli/virtual-config-shim.ts',
            };
        },
    },
]);
