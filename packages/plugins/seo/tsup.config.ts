import { defineConfig } from 'tsup';

export default defineConfig({
    // Only the plugin definition (config + service) is bundled. The admin React
    // components, their CSS, and the locale bundles ship as SOURCE via the
    // package's `./admin/*` and `./locales/*` exports — the host app's Vite
    // compiles them so they share its React/context instance (the integration
    // aliases `astromech/ui` to the library src for exactly this reason).
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node22',
    dts: !process.env.ASTROMECH_NO_DTS,
    sourcemap: true,
    clean: true,
    external: ['astromech', 'astromech/fields'],
    treeshake: true,
});
