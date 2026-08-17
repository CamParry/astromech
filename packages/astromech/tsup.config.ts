import { defineConfig } from 'tsup';

export default defineConfig([
    // Library build — `virtual:astromech/config` is injected by the Astro integration at runtime
    {
        // Sources point ONLY at the curated `src/exports/` layer. Output keys
        // mirror the source layout, and the package.json subpaths mirror them in
        // turn, so a public import names the directory the code lives in. The
        // scheduler subpaths are the exception: they are named for the `scheduler`
        // config key rather than for `src/cron/`, which holds jobs and triggering.
        entry: {
            index: 'src/exports/index.ts',
            fields: 'src/exports/fields.ts',
            columns: 'src/exports/columns.ts',
            methods: 'src/exports/methods.ts',
            'integrations/astro/index': 'src/exports/astro.ts',
            'local/index': 'src/exports/local.ts',
            'fetch/index': 'src/exports/fetch.ts',
            middleware: 'src/exports/middleware.ts',
            'database/schema': 'src/exports/database-schema.ts',
            'admin/components/ui/index': 'src/exports/admin/ui.ts',
            'admin/components/ui/app': 'src/exports/admin/ui-app.ts',
            'admin/components/ui/layout': 'src/exports/admin/ui-layout.ts',
            'admin/components/fields/index': 'src/exports/admin/ui-fields.ts',
            'email/index': 'src/exports/email.ts',
            'email/drivers/console': 'src/exports/email-console.ts',
            'email/drivers/resend': 'src/exports/email-resend.ts',
            'email/drivers/smtp': 'src/exports/email-smtp.ts',
            'scheduler/drivers/interval': 'src/exports/scheduler-interval.ts',
            'scheduler/drivers/webhook': 'src/exports/scheduler-webhook.ts',
            'scheduler/drivers/cloudflare': 'src/exports/scheduler-cloudflare.ts',
            'media/image/drivers/sharp': 'src/exports/media-image-sharp.ts',
            'media/image/drivers/cloudflare': 'src/exports/media-image-cloudflare.ts',
            'storage/drivers/r2': 'src/exports/storage-r2.ts',
            'storage/drivers/filesystem': 'src/exports/storage-filesystem.ts',
            'storage/drivers/s3': 'src/exports/storage-s3.ts',
            'database/drivers/d1': 'src/exports/database-d1.ts',
            'database/drivers/libsql': 'src/exports/database-libsql.ts',
            'cloudflare/index': 'src/exports/cloudflare.ts',
        },
        format: ['esm'],
        // The floor in engines.node, enforced rather than assumed: esbuild
        // defaults to esnext and would happily emit syntax Node 22 cannot run.
        target: 'node22',
        dts: true,
        sourcemap: true,
        clean: true,
        external: [
            'astro',
            'better-auth',
            'react',
            'sharp',
            'blurhash',
            'virtual:astromech/config',
            'virtual:astromech/admin-config',
            'virtual:astromech/plugins/components',
            'cloudflare:workers',
            'wrangler',
        ],
        treeshake: true,
    },
    // CLI build — the config arrives as an argument, so no virtual module is involved
    {
        entry: {
            // `bin: astromech` -> dist/cli/index.js stays stable; source moved.
            'cli/index': 'src/transport/cli/index.ts',
            // MCP server — dynamically imported by the `astromech mcp` subcommand.
            'transport/mcp/index': 'src/transport/mcp/index.ts',
        },
        format: ['esm'],
        target: 'node22',
        dts: false,
        sourcemap: true,
        clean: false,
        external: [
            'astro',
            'better-auth',
            'virtual:astromech/admin-config',
            '@modelcontextprotocol/sdk',
            '@modelcontextprotocol/sdk/server/index.js',
            '@modelcontextprotocol/sdk/server/stdio.js',
            '@modelcontextprotocol/sdk/types.js',
            'cloudflare:workers',
            'wrangler',
        ],
        treeshake: true,
        banner: { js: '#!/usr/bin/env node' },
    },
]);
