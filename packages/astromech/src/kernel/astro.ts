/**
 * Astromech — Astro adapter (thin shell)
 *
 * Bridges astromech.config.ts with Astro's integration API. Boot and
 * config-assembly logic lives in kernel/boot, kernel/admin-config, and
 * codegen/plugin-client-manifest; this file wires them together.
 *
 * @example
 * // astromech.config.ts
 * import { defineConfig } from 'astromech';
 * export default defineConfig({ ... });
 *
 * // astro.config.mjs
 * import { astromech } from 'astromech/astro';
 * import astromechConfig from './astromech.config.ts';
 * export default defineConfig({ integrations: [astromech(astromechConfig)] });
 */

import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import type { AstromechConfig } from '@/types/index.js';
import { resolveConfig } from '@/kernel/config-resolver.js';
import { registerRoutes } from '@/kernel/route-registration.js';
import { collectPluginFieldTypes } from '@/plugins/runtime/plugin-fields.js';
import { initRuntime, runMigrations, startScheduler } from '@/kernel/boot.js';
import { buildAdminConfig } from '@/kernel/admin-config.js';
import { generatePluginClientManifest } from '@/codegen/plugin-client-manifest.js';

export function astromech(config: AstromechConfig): AstroIntegration {
    const resolvedConfig = resolveConfig(config);
    // dist/kernel/astro.js — go up two levels to reach package src/
    const pkgSrc = fileURLToPath(new URL('../../src', import.meta.url));

    return {
        name: 'astromech',
        hooks: {
            'astro:config:setup': async ({
                updateConfig,
                injectRoute,
                addMiddleware,
                logger,
            }) => {
                logger.info('Initializing Astromech CMS');

                await initRuntime(config, resolvedConfig);

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
                                        return `export default ${JSON.stringify(resolvedConfig)};`;
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
                                // import specifiers in plugin definitions (spec §11).
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
                                            config.plugins ?? []
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
                const { generateSdkTypes } = await import('@/codegen/type-generator.js');
                injectTypes({
                    filename: 'astromech.d.ts',
                    content: generateSdkTypes(
                        resolvedConfig,
                        collectPluginFieldTypes(config.plugins ?? []),
                        config.plugins ?? []
                    ),
                });

                const { generateMethodManifest, METHOD_MANIFEST_FILENAME } =
                    await import('@/codegen/method-manifest.js');
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

            'astro:server:setup': async ({ logger }) => {
                logger.info('Astromech dev server ready');
                await runMigrations(logger);
                await startScheduler();
            },

            'astro:build:done': async ({ logger }) => {
                logger.info('Astromech build complete');
                await runMigrations(logger);
            },
        },
    };
}
