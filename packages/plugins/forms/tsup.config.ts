import { defineConfig } from 'tsup';

export default defineConfig({
    // One entry: the plugin itself. `src/tables/index.ts` is deliberately not
    // built — `plugin:generate` loads it from source with jiti, and no consumer
    // imports the submissions table.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: [
        'astromech',
        'astromech/fields',
        'astromech/columns',
        'astromech/email',
        'react',
    ],
    treeshake: true,
});
