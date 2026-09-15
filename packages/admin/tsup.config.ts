import { defineConfig } from 'tsup';

// The admin ships as source: the site's Vite compiles it, so plugin components
// and the admin share one React. Only what plain Node loads is built. That is
// the Vite helper, which the Astro integration imports at config time, and the
// four `astromech/ui` entries, which core re-exports by name. Their
// declarations are what a plugin's own type build reads.
export default defineConfig({
    entry: {
        vite: 'src/vite.ts',
        'ui/index': 'src/exports/ui.ts',
        'ui/app': 'src/exports/ui-app.ts',
        'ui/layout': 'src/exports/ui-layout.ts',
        'ui/fields': 'src/exports/ui-fields.ts',
    },
    format: ['esm'],
    // The floor in engines.node, as in core.
    target: 'node22',
    // `ASTROMECH_NO_DTS` skips declarations for the builds no type check reads.
    // The declaration program reads core's source through `paths`, so its
    // root is `packages/`, not `src/`.
    dts: process.env.ASTROMECH_NO_DTS ? false : { compilerOptions: { rootDir: '..' } },
    sourcemap: true,
    clean: true,
    // Dependencies and peers are external already. These exist only inside a
    // site's Vite graph, which the Astro integration builds.
    external: ['virtual:astromech/admin-config', 'virtual:astromech/plugins/components'],
    treeshake: true,
});
