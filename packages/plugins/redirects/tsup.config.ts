import { defineConfig } from 'tsup';

export default defineConfig({
    // Two entries: the plugin itself, and a `./schema` subpath that ships only
    // the table descriptors, so a consuming app (or `plugin:generate`) can load
    // the schema standalone without pulling in the plugin definition.
    entry: { index: 'src/index.ts', schema: 'src/schema/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: [
        'astromech',
        'astromech/fields',
        'astromech/columns',
        'astromech/plugin-kit',
    ],
    treeshake: true,
});
