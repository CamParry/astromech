/**
 * The Vite config the integration hands to Astro's `updateConfig`: the aliases
 * onto package source, dependency pre-bundling, build-time defines and the
 * virtual modules.
 */

import { fileURLToPath } from 'node:url';
import type { HookParameters } from 'astro';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import { resolveConfigPath } from '@/config/load';
import { buildAdminConfig } from '@/config/admin-config';
import { generatePluginClientManifest } from '@/codegen/plugin-client-manifest';
import { virtualModule } from '@/integrations/astro/virtual-module';

/** The `vite` field of the config update Astro accepts. */
type ViteConfig = NonNullable<
    Parameters<HookParameters<'astro:config:setup'>['updateConfig']>[0]['vite']
>;

export type ViteConfigOptions = {
    /** Absolute path to this package's `src/`, the target of the aliases. */
    packageSource: string;
    /** The Astro project root. */
    root: URL;
    /** The site's config file path, as passed to the integration. */
    configFile: string | undefined;
    config: AstromechConfig;
    resolvedConfig: ResolvedConfig;
};

/** Build the `vite` half of the Astro config update. */
export function createViteConfig({
    packageSource,
    root,
    configFile,
    config,
    resolvedConfig,
}: ViteConfigOptions): ViteConfig {
    const rootDir = fileURLToPath(root);
    const plugins = config.plugins ?? [];

    return {
        resolve: {
            // Browser-facing entries alias to package src so plugin components
            // share module identity (React context, hooks) with the admin app.
            // Specific keys first — bare `astromech/ui` would shadow them.
            alias: {
                'astromech/ui/fields':
                    packageSource + '/admin/components/fields/index.ts',
                'astromech/ui/layout': packageSource + '/admin/components/ui/layout.ts',
                'astromech/ui/app': packageSource + '/admin/components/ui/app.ts',
                'astromech/ui': packageSource + '/admin/components/ui/index.ts',
                '@/': packageSource + '/',
            },
        },
        ssr: {
            noExternal: ['@fontsource-variable/inter'],
        },
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
                '@tiptap/starter-kit',
                'lodash-es',
            ],
        },
        define: {
            __ASTROMECH_BASE_PATH__: JSON.stringify(resolvedConfig.basePath),
        },
        plugins: [
            TanStackRouterVite({
                routesDirectory: packageSource + '/admin/pages',
                generatedRouteTree: packageSource + '/admin/routeTree.gen.ts',
                routeToken: 'route',
            }),
            virtualModule('virtual:astromech/config', () =>
                liveConfigModule(resolveConfigPath(rootDir, configFile))
            ),
            virtualModule(
                'virtual:astromech/admin-config',
                () =>
                    `export default ${JSON.stringify(buildAdminConfig(config, resolvedConfig))};`
            ),
            // Browser-bound plugin assets must be statically importable, so this
            // module code-gens lazy `import()` calls from the string import
            // specifiers in plugin definitions and in the host's `admin.pages`.
            virtualModule('virtual:astromech/plugins/components', () =>
                generatePluginClientManifest(plugins, {
                    pages: config.admin?.pages ?? [],
                    root: root.href,
                })
            ),
        ],
    };
}

/**
 * Source for `virtual:astromech/config`. Re-exporting the author's module puts
 * the live config in the SSR graph, so functions and class instances survive
 * where a JSON literal destroyed them. It carries the config as written: the
 * resolved one is produced once by boot and read from `config/registry.ts`.
 */
function liveConfigModule(configPath: string): string {
    return [
        `import rawConfig from ${specifier(configPath)};`,
        `export { rawConfig };`,
    ].join('\n');
}

/** An absolute filesystem path as a module specifier literal. */
function specifier(path: string): string {
    return JSON.stringify(path.replace(/\\/g, '/'));
}
