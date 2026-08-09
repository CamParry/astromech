/**
 * Astromech — Astro adapter (thin shell)
 *
 * Bridges astromech.config.ts with Astro's integration API. Boot and
 * config-assembly logic lives in boot/boot, boot/admin-config, and
 * codegen/plugin-client-manifest; this file wires them together.
 *
 * @example
 * // astromech.config.ts
 * import { defineConfig } from 'astromech';
 * export default defineConfig({ ... });
 *
 * // astro.config.mjs
 * import { astromech } from 'astromech/astro';
 * export default defineConfig({ integrations: [astromech()] });
 *
 * // non-default config path
 * export default defineConfig({
 *     integrations: [astromech({ configFile: './elsewhere.ts' })],
 * });
 */

import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import { resolveConfig } from '@/boot/config-resolver';
import { loadConfigFile, resolveConfigPath } from '@/boot/config-loader';
import { registerRoutes } from '@/boot/route-registration';
import { collectPluginFieldTypes } from '@/plugins/runtime/plugin-fields';
import { runMigrations } from '@/boot/boot';
import { buildAdminConfig } from '@/boot/admin-config';
import { generatePluginClientManifest } from '@/codegen/plugin-client-manifest';

export type AstromechIntegrationOptions = {
    /** Path to the site's astromech.config.ts, resolved against the Astro project root. */
    configFile?: string;
};

export function astromech(options: AstromechIntegrationOptions = {}): AstroIntegration {
    // dist/boot/astro.js — go up two levels to reach package src/
    const pkgSrc = fileURLToPath(new URL('../../src', import.meta.url));

    let loaded: { config: AstromechConfig; resolved: ResolvedConfig } | undefined;

    function requireLoaded(): { config: AstromechConfig; resolved: ResolvedConfig } {
        if (loaded === undefined) {
            throw new Error(
                '[Astromech] Config not loaded — the astro:config:setup hook has not run.'
            );
        }
        return loaded;
    }

    return {
        name: 'astromech',
        hooks: {
            'astro:config:setup': async ({
                updateConfig,
                injectRoute,
                addMiddleware,
                logger,
                config: astroConfig,
            }) => {
                const rootDir = fileURLToPath(astroConfig.root);
                const config = await loadConfigFile(rootDir, options.configFile);
                const resolvedConfig = resolveConfig(config);
                loaded = { config, resolved: resolvedConfig };

                logger.info('Initializing Astromech CMS');

                updateConfig({
                    vite: {
                        resolve: {
                            // Public browser-facing entries alias to package src so
                            // plugin components share module identity (React context,
                            // hooks) with the admin app. Specific keys first — the
                            // bare `astromech/ui` would otherwise shadow them.
                            alias: {
                                'astromech/ui/fields':
                                    pkgSrc + '/admin/components/fields/index.ts',
                                'astromech/ui/layout':
                                    pkgSrc + '/admin/components/ui/layout.ts',
                                'astromech/ui': pkgSrc + '/admin/components/ui/index.ts',
                                '@/': pkgSrc + '/',
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
                            __ASTROMECH_ADMIN_ROUTE__: JSON.stringify(
                                resolvedConfig.adminRoute
                            ),
                            __ASTROMECH_API_ROUTE__: JSON.stringify(
                                resolvedConfig.apiRoute
                            ),
                        },
                        plugins: [
                            TanStackRouterVite({
                                routesDirectory: pkgSrc + '/admin/pages',
                                generatedRouteTree: pkgSrc + '/admin/routeTree.gen.ts',
                                routeToken: 'route',
                            }),
                            {
                                name: 'virtual:astromech/config',
                                resolveId(id) {
                                    if (id === 'virtual:astromech/config') {
                                        return '\0virtual:astromech/config';
                                    }
                                    return undefined;
                                },
                                load(id) {
                                    if (id === '\0virtual:astromech/config') {
                                        return liveConfigModule(
                                            resolveConfigPath(rootDir, options.configFile)
                                        );
                                    }
                                    return undefined;
                                },
                            },
                            {
                                name: 'virtual:astromech/admin-config',
                                resolveId(id) {
                                    if (id === 'virtual:astromech/admin-config') {
                                        return '\0virtual:astromech/admin-config';
                                    }
                                    return undefined;
                                },
                                load(id) {
                                    if (id === '\0virtual:astromech/admin-config') {
                                        return `export default ${JSON.stringify(buildAdminConfig(config, resolvedConfig))};`;
                                    }
                                    return undefined;
                                },
                            },
                            {
                                // Browser-bound plugin assets must be statically importable, so
                                // this module CODE-GENS lazy `import()` calls from the string
                                // import specifiers in plugin definitions (spec §11) and in the
                                // host's own `admin.pages`.
                                name: 'virtual:astromech/plugins/components',
                                resolveId(id) {
                                    if (id === 'virtual:astromech/plugins/components') {
                                        return '\0virtual:astromech/plugins/components';
                                    }
                                    return undefined;
                                },
                                load(id) {
                                    if (id === '\0virtual:astromech/plugins/components') {
                                        return generatePluginClientManifest(
                                            config.plugins ?? [],
                                            {
                                                pages: config.admin?.pages ?? [],
                                                root: astroConfig.root.href,
                                            }
                                        );
                                    }
                                    return undefined;
                                },
                            },
                        ],
                    },
                });

                registerRoutes(injectRoute, resolvedConfig);

                addMiddleware({
                    entrypoint: 'astromech/middleware',
                    order: 'pre',
                });

                logger.info(
                    `Admin UI: ${resolvedConfig.adminRoute}, API: ${resolvedConfig.apiRoute}`
                );
                logger.info(
                    `Entry types: ${Object.keys(resolvedConfig.entries).join(', ')}`
                );
            },

            'astro:config:done': async ({ injectTypes, logger, config: astroConfig }) => {
                const { config, resolved: resolvedConfig } = requireLoaded();
                const { generateClientTypes } = await import('@/codegen/type-generator');
                injectTypes({
                    filename: 'astromech.d.ts',
                    content: generateClientTypes(
                        resolvedConfig,
                        collectPluginFieldTypes(config.plugins ?? []),
                        config.plugins ?? []
                    ),
                });

                const { generateMethodManifest, METHOD_MANIFEST_FILENAME } =
                    await import('@/codegen/method-manifest');
                const manifestJson = generateMethodManifest(
                    resolvedConfig,
                    config.plugins ?? []
                );
                const { writeFile, mkdir } = await import('node:fs/promises');
                const { fileURLToPath } = await import('node:url');
                const dotAstroDir = fileURLToPath(new URL('.astro/', astroConfig.root));
                try {
                    await mkdir(dotAstroDir, { recursive: true });
                    await writeFile(
                        `${dotAstroDir}${METHOD_MANIFEST_FILENAME}`,
                        manifestJson,
                        'utf-8'
                    );
                } catch (err) {
                    logger.warn(
                        `Failed to write method manifest: ${err instanceof Error ? err.message : String(err)}`
                    );
                }

                logger.info('Astromech configuration complete');
            },

            // Migrations run in the build/dev process against their own database
            // handle. Nothing here touches the registries: the one booted copy of
            // the config lives in the serving process (see src/middleware.ts).
            'astro:server:setup': async ({ logger }) => {
                const { config } = requireLoaded();
                logger.info('Astromech dev server ready');
                await runMigrations(
                    config.db.getInstance(),
                    logger,
                    config.plugins ?? []
                );
            },

            'astro:build:done': async ({ logger }) => {
                const { config } = requireLoaded();
                logger.info('Astromech build complete');
                await runMigrations(
                    config.db.getInstance(),
                    logger,
                    config.plugins ?? []
                );
            },
        },
    };
}

/**
 * Source for `virtual:astromech/config`. Re-exporting the author's module puts
 * the live config in the SSR graph, so functions and class instances survive
 * where a JSON literal destroyed them.
 */
function liveConfigModule(configPath: string): string {
    const resolverPath = fileURLToPath(new URL('./config-resolver.js', import.meta.url));
    return [
        `import rawConfig from ${specifier(configPath)};`,
        `import { resolveConfig } from ${specifier(resolverPath)};`,
        `export { rawConfig };`,
        `export default resolveConfig(rawConfig);`,
    ].join('\n');
}

/** An absolute filesystem path as a module specifier literal. */
function specifier(path: string): string {
    return JSON.stringify(path.replace(/\\/g, '/'));
}
