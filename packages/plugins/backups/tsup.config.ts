import { defineConfig } from 'tsup';

export default defineConfig({
    // Two entries: the plugin itself, and a `./schema` subpath that ships only
    // the drizzle table (pure drizzle-orm, no astromech import) so a consuming
    // app's drizzle config / seed can load it standalone for migrations.
    entry: { index: 'src/index.ts', schema: 'src/schema/runs.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: [
        'astromech',
        'astromech/fields',
        'astromech/columns',
        'astromech/plugin-kit',
        'drizzle-orm',
        'drizzle-orm/sqlite-core',
    ],
    treeshake: true,
});
