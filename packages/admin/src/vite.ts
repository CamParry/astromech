/**
 * What the Astro integration needs from the admin to serve it: the
 * `astromech/ui*` aliases onto admin source, the admin's share of
 * `optimizeDeps.include`, the TanStack Router plugin that writes its route
 * tree, and the path of the shell page. Runs in Node at config time.
 */

import { fileURLToPath } from 'node:url';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export type AdminViteConfig = {
    /** Aliases onto admin source, the more specific keys first. */
    alias: Record<string, string>;
    /** The packages the admin imports in the browser, for Vite to pre-bundle. */
    optimizeDeps: { include: string[] };
    plugins: ReturnType<typeof TanStackRouterVite>[];
    /** Absolute path to `shell.astro`, the page the admin route serves. */
    shellEntrypoint: string;
};

/** Build the admin's share of the site's Vite config. */
export function createAdminViteConfig(): AdminViteConfig {
    // `src/vite.ts` under vitest and `dist/vite.js` in a site both sit one
    // level below the package root.
    const source = fileURLToPath(new URL('../src/', import.meta.url));

    return {
        // Plugin components must share module identity (React context, hooks)
        // with the admin app, so the kit resolves to the source the admin
        // imports. Bare `astromech/ui` would shadow the others, so it is last.
        alias: {
            'astromech/ui/fields': source + 'components/fields/index.ts',
            'astromech/ui/layout': source + 'components/ui/layout.ts',
            'astromech/ui/app': source + 'components/ui/app.ts',
            'astromech/ui': source + 'components/ui/index.ts',
        },
        // The admin is compiled by the site's Vite, so these resolve from the
        // site's root. pnpm-workspace.yaml hoists each one for that reason.
        optimizeDeps: {
            include: [
                'react',
                'react-dom',
                'react/jsx-runtime',
                'lucide-react',
                '@tanstack/react-router',
                '@tanstack/react-query',
                '@base-ui/react',
                'i18next',
                'react-i18next',
                '@tiptap/core',
                '@tiptap/react',
            ],
        },
        plugins: [
            TanStackRouterVite({
                routesDirectory: source + 'pages',
                generatedRouteTree: source + 'routeTree.gen.ts',
                routeToken: 'route',
            }),
        ],
        shellEntrypoint: source + 'shell.astro',
    };
}
