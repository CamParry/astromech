import { defineConfig } from 'tsup';

export default defineConfig({
    // Only the plugin definition (config + service) is bundled. The admin React
    // components and their CSS ship as SOURCE via the package's `./admin/*`
    // export — the host app's Vite compiles them so they share its
    // React/context instance (the integration aliases `astromech/ui` to the
    // library src for exactly this reason).
    // The `./tables` subpath ships only the tables, so a consuming
    // app (or `plugin:generate`) can load them without the plugin definition.
    entry: { index: 'src/index.ts', tables: 'src/tables/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['astromech', 'astromech/fields', '@anthropic-ai/sdk'],
    treeshake: true,
});
