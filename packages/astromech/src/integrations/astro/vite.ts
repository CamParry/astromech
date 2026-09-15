/**
 * The Vite config the integration hands to Astro's `updateConfig`: the aliases
 * onto package source, dependency pre-bundling, build-time defines and the
 * virtual modules. The admin package supplies its own share, which this merges.
 */

import type { AstromechConfig, PluginDefinition, ResolvedConfig } from '@/types/index';
import type { AdminViteConfig } from '@astromech/admin/vite';
import type { HookParameters } from 'astro';
import { fileURLToPath } from 'node:url';
import {
    generatePluginClientManifest,
    hasFileRoot,
} from '@/codegen/plugin-client-manifest';
import { buildAdminConfig } from '@/config/admin-config';
import { resolveConfigPath } from '@/config/load';
import { coreSourceAlias } from '@/integrations/astro/core-source-alias';
import { virtualModule } from '@/integrations/astro/virtual-module';

/** The `vite` field of the config update Astro accepts. */
type ViteConfig = NonNullable<
    Parameters<HookParameters<'astro:config:setup'>['updateConfig']>[0]['vite']
>;

export type ViteConfigOptions = {
    /** Absolute path to this package's `src/`, the target of core's aliases. */
    packageSource: string;
    /** The admin package's share: its aliases, pre-bundled packages and router plugin. */
    admin: AdminViteConfig;
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
    admin,
    root,
    configFile,
    config,
    resolvedConfig,
}: ViteConfigOptions): ViteConfig {
    const rootDir = fileURLToPath(root);
    const plugins = config.plugins ?? [];

    return {
        resolve: {
            // Browser-facing entries alias to source so plugin components share
            // module identity (React context, hooks) with the admin app. The
            // admin's aliases cover `astromech/ui*`. `astromech/shared` and
            // `astromech/fetch` are how the admin reaches core, so every browser
            // caller shares their one module instance.
            alias: {
                ...admin.alias,
                'astromech/shared': packageSource + '/exports/shared.ts',
                'astromech/fetch': packageSource + '/exports/fetch.ts',
            },
        },
        // Core and the admin ship source only the site's Vite can compile: core's
        // `@/` imports resolve through `astromech:core-source-alias`, a plugin the
        // pre-bundler does not run. So neither package is pre-bundled. A package
        // name also excludes its subpaths, and Vite checks the specifier before an
        // alias replaces it, so `astromech/shared` and `astromech/fetch` stay out
        // too. `include` still pre-bundles the packages they depend on.
        optimizeDeps: {
            exclude: ['astromech', '@astromech/admin'],
            // Named from the site's root. Peers stay flat, because the site installs
            // them and shares one copy. The rest go through the packages that depend
            // on them: Vite finds `c` in `a > b > c` from `b`, found from `a`.
            include: [
                ...new Set([
                    ...admin.optimizeDeps.peerDependencies,
                    ...admin.optimizeDeps.dependencies.map(
                        (specifier) => `astromech > @astromech/admin > ${specifier}`
                    ),
                    // Reached in the browser by `astromech/shared`, not by the admin.
                    'astromech > @tiptap/starter-kit',
                    'astromech > lodash-es',
                    ...plugins.flatMap(pluginOptimizeDeps),
                ]),
            ],
        },
        define: {
            __ASTROMECH_BASE_PATH__: JSON.stringify(resolvedConfig.basePath),
        },
        plugins: [
            coreSourceAlias(packageSource),
            ...admin.plugins,
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
 * A plugin's browser packages, named from the site's root: through the plugin's
 * package, or bare for a plugin with a `file:` root, whose imports resolve from
 * the site.
 */
function pluginOptimizeDeps(def: PluginDefinition): string[] {
    const include = def.admin?.optimizeDeps?.include ?? [];
    if (hasFileRoot(def)) return include;
    return include.map((specifier) => `${def.package} > ${specifier}`);
}

/**
 * Source for `virtual:astromech/config`. Re-exporting the author's module
 * puts the live config in the SSR graph, so functions and class instances
 * survive where a JSON literal would destroy them.
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
