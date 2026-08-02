import { defineConfig } from 'tsup';

export default defineConfig({
    // Two entries: the plugin itself, and a `./tables` subpath that ships only
    // the table descriptors, so a consuming app (or `plugin:generate`) can load
    // the descriptors standalone without pulling in the plugin definition.
    entry: { index: 'src/index.ts', tables: 'src/tables/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['astromech', 'astromech/fields'],
    treeshake: true,
});
