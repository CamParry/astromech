import { defineConfig } from 'tsup';

export default defineConfig([
    // Library build — virtual:astromech/config is injected by the Astro integration at runtime
    {
        // Sources point ONLY at the curated `src/exports/` layer; output keys
        // (and therefore dist paths + package.json subpaths) are unchanged, so
        // the public contract is frozen while internals are free to move.
        entry: {
            index: 'src/exports/index.ts',
            fields: 'src/exports/fields.ts',
            columns: 'src/exports/columns.ts',
            'plugin-kit': 'src/exports/plugin-kit.ts',
            'kernel/astro': 'src/exports/astro.ts',
            'sdk/local/index': 'src/exports/local.ts',
            'sdk/fetch/index': 'src/exports/fetch.ts',
            middleware: 'src/exports/middleware.ts',
            'db/schema': 'src/exports/schema.ts',
            'admin/components/ui/index': 'src/exports/admin/ui.ts',
            'admin/components/ui/layout': 'src/exports/admin/ui-layout.ts',
            'admin/components/fields/index': 'src/exports/admin/ui-fields.ts',
            'db/plugin-helpers': 'src/exports/plugin-helpers.ts',
            'email/index': 'src/exports/email.ts',
            'plugins/redirects/index': 'src/exports/plugins/redirects.ts',
            'plugins/redirects/schema': 'src/exports/plugins/redirects-schema.ts',
            'plugins/seo/index': 'src/exports/plugins/seo.ts',
            'images/drivers/sharp': 'src/exports/image-sharp.ts',
            'images/drivers/cloudflare': 'src/exports/image-cloudflare.ts',
            'storage/drivers/r2': 'src/exports/storage-r2.ts',
        },
        format: ['esm'],
        dts: true,
        sourcemap: true,
        clean: true,
        external: [
            'astro',
            'drizzle-orm',
            'better-auth',
            'react',
            'sharp',
            'blurhash',
            'virtual:astromech/config',
            'virtual:astromech/admin-config',
            'virtual:astromech/plugins/components',
        ],
        treeshake: true,
    },
    // CLI build — virtual:astromech/config is shimmed with the live-config proxy
    {
        entry: {
            // `bin: astromech` -> dist/cli/index.js stays stable; source moved.
            'cli/index': 'src/transport/cli/index.ts',
        },
        format: ['esm'],
        dts: false,
        sourcemap: true,
        clean: false,
        external: [
            'astro',
            'drizzle-orm',
            'better-auth',
            'virtual:astromech/admin-config',
        ],
        treeshake: true,
        banner: { js: '#!/usr/bin/env node' },
        esbuildOptions(options) {
            options.alias = {
                'virtual:astromech/config': './src/transport/cli/virtual-config-shim.ts',
            };
        },
    },
]);
