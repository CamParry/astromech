/**
 * What the Astro integration needs from the admin to serve it: `astromech/ui*`
 * aliases, browser packages to pre-bundle, the router and icon plugins, and the
 * shell page. Runs in Node at config time.
 */

import { fileURLToPath } from 'node:url';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { icons } from 'lucide-react';

const ICONS_MODULE_ID = 'virtual:astromech/admin-icons';

export type AdminViteConfigOptions = {
    /** Lucide icon names the admin config sets, served by `virtual:astromech/admin-icons`. */
    iconNames?: string[];
    /** Reports an icon name Lucide does not have. Defaults to `console.warn`. */
    warn?: (message: string) => void;
};

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
    plugins: (ReturnType<typeof TanStackRouterVite> | AdminIconsPlugin)[];
    /** Absolute path to `shell.astro`, the page the admin route serves. */
    shellEntrypoint: string;
};

/** The part of Vite's plugin context the icons plugin calls. */
export type ResolveContext = {
    resolve: (
        id: string,
        importer?: string,
        options?: { skipSelf?: boolean }
    ) => Promise<{ id: string } | null>;
};

/** Minimal Vite plugin shape for `virtual:astromech/admin-icons`. */
export type AdminIconsPlugin = {
    name: string;
    enforce: 'pre';
    resolveId: (
        this: ResolveContext,
        id: string,
        importer: string | undefined
    ) => string | Promise<{ id: string } | null> | null;
    load: (id: string) => string | null;
};

/** Build the admin's share of the site's Vite config. */
export function createAdminViteConfig(
    options: AdminViteConfigOptions = {}
): AdminViteConfig {
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
                // Each route's component loads as its own chunk.
                autoCodeSplitting: true,
            }),
            adminIcons(filterKnownIcons(options), source + 'main.tsx'),
        ],
        shellEntrypoint: source + 'shell.astro',
    };
}

/** Keep the names Lucide has, reporting each one it does not. */
function filterKnownIcons({
    iconNames = [],
    warn = (message) => console.warn(`[astromech] ${message}`),
}: AdminViteConfigOptions): string[] {
    return [...new Set(iconNames)].filter((name) => {
        if (Object.hasOwn(icons, name)) return true;
        warn(`Unknown Lucide icon "${name}"; the admin shows its default icon.`);
        return false;
    });
}

/** Serve `virtual:astromech/admin-icons`, importing only the named icons. */
function adminIcons(names: string[], adminEntry: string): AdminIconsPlugin {
    const resolvedId = `\0${ICONS_MODULE_ID}`;
    const list = names.join(', ');
    return {
        name: 'astromech:admin-icons',
        enforce: 'pre',
        resolveId(id, importer) {
            if (id === ICONS_MODULE_ID) return resolvedId;
            // A site cannot resolve the admin's `lucide-react` from its root, and
            // `astro dev` serves the pre-bundled copy, so resolve it from the admin.
            if (id === 'lucide-react' && importer === resolvedId) {
                return this.resolve('lucide-react', adminEntry, { skipSelf: true });
            }
            return null;
        },
        load(id) {
            if (id !== resolvedId) return null;
            if (names.length === 0) return 'export default {};';
            return `import { ${list} } from 'lucide-react';\nexport default { ${list} };`;
        },
    };
}
