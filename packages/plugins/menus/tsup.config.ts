import { defineConfig } from 'tsup';

export default defineConfig({
    // A first-party plugin package: builds from its own `src`, consumes core
    // only through the published `astromech` surface (kept external so the host
    // app's single copy is shared, never bundled in).
    entry: { index: 'src/index.ts' },
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
