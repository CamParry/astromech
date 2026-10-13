/**
 * The Vite config the integration hands to Astro's `updateConfig`: the aliases
 * onto package source, dependency pre-bundling, build-time defines and the
 * virtual modules. The admin package supplies its own share, which this merges.
 */

import type { PackageExports } from '@/integrations/astro/core-source-alias';
import type { AdminConfig } from '@/types/config';
import type { AstromechConfig, PluginDefinition, ResolvedConfig } from '@/types/index';
import type { AdminViteConfig } from '@astromech/admin/vite';
import type { HookParameters } from 'astro';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    generatePluginClientManifest,
    hasFileRoot,
} from '@/codegen/plugin-client-manifest';
import { buildAdminConfig } from '@/config/admin-config';
import { resolveConfigPath } from '@/config/load';
import {
    coreSourceAlias,
    listDistSubpaths,
} from '@/integrations/astro/core-source-alias';
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
    /** Whether Astro takes `clientAddress` from `x-forwarded-for`, known once its config is done. */
    astroReadsForwardedFor: () => boolean;
    /** Whether Astro sends a content security policy (`security.csp`), known once its config is done. */
    astroSendsCsp: () => boolean;
    /** Whether Astro runs `astro dev`, rather than a build. */
    dev: boolean;
};

/** Build the `vite` half of the Astro config update. */
export function createViteConfig({
    packageSource,
    admin,
    root,
    configFile,
    config,
    resolvedConfig,
    astroReadsForwardedFor,
    astroSendsCsp,
    dev,
}: ViteConfigOptions): ViteConfig {
    const rootDir = fileURLToPath(root);
    const plugins = config.plugins ?? [];

    return {
        resolve: {
            // The kit's entries alias to the admin's source, so plugin components
            // share module identity (React context, hooks) with the admin app.
            // Core's own subpaths resolve to source in `astromech:core-source-alias`.
            alias: admin.alias,
        },
        // Core and the admin ship source only the site's Vite can compile: core's
        // subpaths and its `@/` imports resolve through
        // `astromech:core-source-alias`, a plugin the pre-bundler does not run.
        // So neither package is pre-bundled. A package name also excludes its
        // subpaths, and Vite checks the specifier before a plugin or alias
        // resolves it. `include` still pre-bundles the packages they depend on.
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
                    'astromech > @tiptap/extension-placeholder',
                    'astromech > @tiptap/extension-text-align',
                    'astromech > @tiptap/pm/model',
                    'astromech > @tiptap/starter-kit',
                    'astromech > @tiptap/static-renderer/pm/html-string',
                    'astromech > lodash-es',
                    'astromech > zod',
                    ...plugins.flatMap(pluginOptimizeDeps),
                ]),
            ],
        },
        define: {
            __ASTROMECH_BASE_PATH__: JSON.stringify(resolvedConfig.basePath),
        },
        plugins: [
            coreSourceAlias(
                packageSource,
                listDistSubpaths(readCoreExports(packageSource))
            ),
            ...admin.plugins,
            virtualModule('virtual:astromech/config', () =>
                liveConfigModule(
                    resolveConfigPath(rootDir, configFile),
                    astroReadsForwardedFor(),
                    astroSendsCsp(),
                    dev
                )
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

/** The `exports` of core's `package.json`, which sits beside `src`. */
function readCoreExports(packageSource: string): PackageExports {
    const manifest = JSON.parse(
        readFileSync(join(packageSource, '..', 'package.json'), 'utf8')
    ) as { exports: PackageExports };
    return manifest.exports;
}

/** Every `icon` name in the admin config, deduped and sorted, for the admin's icon map. */
export function collectIconNames(adminConfig: AdminConfig): string[] {
    const names = new Set<string>();
    // Walking the whole object keeps a new icon-bearing surface from being missed.
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (value === null || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (key === 'icon' && typeof child === 'string') names.add(child);
            else visit(child);
        }
    };
    visit(adminConfig);
    return [...names].sort();
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
 *
 * `viteEnv` is `import.meta.env` under `astro dev` only. In a build, Astro
 * replaces an `import.meta.env` read as a whole object with every variable of
 * the build machine whose name appears in the module's source, so a build's
 * module never mentions it.
 */
function liveConfigModule(
    configPath: string,
    astroReadsForwardedFor: boolean,
    astroSendsCsp: boolean,
    dev: boolean
): string {
    return [
        `import rawConfig from ${specifier(configPath)};`,
        `export { rawConfig };`,
        `export const astroReadsForwardedFor = ${String(astroReadsForwardedFor)};`,
        `export const astroSendsCsp = ${String(astroSendsCsp)};`,
        `export const viteEnv = ${dev ? 'import.meta.env' : 'undefined'};`,
    ].join('\n');
}

/** An absolute filesystem path as a module specifier literal. */
function specifier(path: string): string {
    return JSON.stringify(path.replace(/\\/g, '/'));
}
