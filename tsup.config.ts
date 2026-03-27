import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'adapters/astro': 'src/adapters/astro.ts',
        'sdk/server/index': 'src/sdk/server/index.ts',
        'sdk/client/index': 'src/sdk/client/index.ts',
        middleware: 'src/middleware.ts',
        'db/schema': 'src/db/schema.ts',
        'admin/components/ui/index': 'src/admin/components/ui/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['astro', 'drizzle-orm', 'better-auth', 'virtual:astromech/config', 'virtual:astromech/admin-config'],
    treeshake: true,
});
