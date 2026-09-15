/**
 * What the Astro integration needs from the admin to serve it: the
 * `astromech/ui*` aliases onto admin source, the packages it imports in the
 * browser, the TanStack Router plugin that writes its route tree, and the path
 * of the shell page. Runs in Node at config time.
 */

import { fileURLToPath } from 'node:url';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export type AdminViteConfig = {
    /** Aliases onto admin source, the more specific keys first. */
    alias: Record<string, string>;
    /** Bare specifiers the admin imports in the browser, for Vite to pre-bundle. */
    optimizeDeps: {
        /** Installed with the admin: its `dependencies`. */
        dependencies: string[];
        /** Installed by the site and shared with it: its `peerDependencies`. */
        peerDependencies: string[];
    };
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
        // Every bare specifier `src` imports at runtime, filed by the
        // package.json field that declares it. Core turns these into
        // Vite's list, because only core knows how a site reaches the admin.
        optimizeDeps: {
            peerDependencies: ['react', 'react-dom', 'react/jsx-runtime'],
            dependencies: [
                '@base-ui/react',
                '@base-ui/react/accordion',
                '@base-ui/react/alert-dialog',
                '@base-ui/react/avatar',
                '@base-ui/react/checkbox',
                '@base-ui/react/collapsible',
                '@base-ui/react/combobox',
                '@base-ui/react/dialog',
                '@base-ui/react/field',
                '@base-ui/react/menu',
                '@base-ui/react/number-field',
                '@base-ui/react/popover',
                '@base-ui/react/progress',
                '@base-ui/react/select',
                '@base-ui/react/slider',
                '@base-ui/react/switch',
                '@base-ui/react/tabs',
                '@base-ui/react/toast',
                '@base-ui/react/toggle',
                '@base-ui/react/toggle-group',
                '@base-ui/react/tooltip',
                '@dnd-kit/core',
                '@dnd-kit/sortable',
                '@dnd-kit/utilities',
                '@tanstack/react-form',
                '@tanstack/react-query',
                '@tanstack/react-router',
                '@tiptap/core',
                '@tiptap/react',
                'clsx',
                'date-fns',
                'i18next',
                'lucide-react',
                'react-colorful',
                'react-i18next',
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
