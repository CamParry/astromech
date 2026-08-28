import { defineConfig } from 'tsup';

export default defineConfig({
    // Two entries: the plugin itself, and a `./tables` subpath that ships only
    // the tables, so a consuming app (or `plugin:generate`) can load
    // them standalone without pulling in the plugin definition.
    entry: { index: 'src/index.ts', tables: 'src/tables/index.ts' },
    format: ['esm'],
    target: 'node22',
    dts: !process.env.ASTROMECH_NO_DTS,
    sourcemap: true,
    clean: true,
    external: ['astromech', 'astromech/fields'],
    treeshake: true,
});
