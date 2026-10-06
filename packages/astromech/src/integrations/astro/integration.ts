/**
 * Astromech's Astro integration. It loads the site's `astromech.config.ts`,
 * hands Astro the Vite config, injects the routes and the middleware, writes
 * the generated types and method manifest, and runs migrations.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { createAdminViteConfig } from '@astromech/admin/vite';
import { buildAdminConfig } from '@/config/admin-config';
import { loadConfigFile } from '@/config/load';
import { resolveConfig } from '@/config/resolve';
import { listAppMigrationNames, resolveMigrationsDir } from '@/database/app-migrations';
import { runMigrations } from '@/database/migrations';
import { AstromechError } from '@/errors/astromech-error';
import { registerRoutes } from '@/integrations/astro/routes';
import { collectIconNames, createViteConfig } from '@/integrations/astro/vite';
import { disposeBindings } from '@/integrations/cloudflare/bindings';

export type AstromechIntegrationOptions = {
    /** Path to the site's astromech.config.ts, resolved against the Astro project root. */
    configFile?: string;
};

/** Build the Astro integration object registered in `astro.config.mjs`. */
export function astromech(options: AstromechIntegrationOptions = {}): AstroIntegration {
    // dist/integrations/astro/index.js — go up three levels to reach package src/
    const packageSource = fileURLToPath(new URL('../../../src', import.meta.url));

    let loaded: { config: AstromechConfig; resolved: ResolvedConfig } | undefined;
    let astroReadsForwardedFor: boolean | undefined;

    function getLoadedConfig(): { config: AstromechConfig; resolved: ResolvedConfig } {
        if (loaded === undefined) {
            throw new AstromechError(
                'Config not loaded — the astro:config:setup hook has not run.'
            );
        }
        return loaded;
    }

    function getAstroReadsForwardedFor(): boolean {
        if (astroReadsForwardedFor === undefined) {
            throw new AstromechError(
                'Astro config not known — the astro:config:done hook has not run.'
            );
        }
        return astroReadsForwardedFor;
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
                assertIntegrationOrder(astroConfig.integrations);

                const rootDir = fileURLToPath(astroConfig.root);
                const config = await loadConfigFile(rootDir, options.configFile);
                const resolvedConfig = resolveConfig(config);
                loaded = { config, resolved: resolvedConfig };

                logger.info('Initializing Astromech CMS');

                const migrationNames = await bundleMigrationNames(
                    resolveMigrationsDir(resolvedConfig.migrationsDir),
                    (message) => logger.warn(message)
                );

                const admin = createAdminViteConfig({
                    iconNames: collectIconNames(buildAdminConfig(config, resolvedConfig)),
                    warn: (message) => logger.warn(message),
                });

                updateConfig({
                    vite: createViteConfig({
                        packageSource,
                        admin,
                        root: astroConfig.root,
                        configFile: options.configFile,
                        config,
                        resolvedConfig,
                        astroReadsForwardedFor: getAstroReadsForwardedFor,
                        migrationNames,
                    }),
                });

                registerRoutes(injectRoute, resolvedConfig, admin.shellEntrypoint);

                addMiddleware({
                    entrypoint: 'astromech/middleware',
                    order: 'pre',
                });

                logger.info(
                    `Admin UI: ${resolvedConfig.basePath}, API: ${resolvedConfig.basePath}/api`
                );
                logger.info(
                    `Entry types: ${Object.keys(resolvedConfig.entryTypes).join(', ')}`
                );
            },

            'astro:config:done': async ({ injectTypes, logger, config: astroConfig }) => {
                const { config, resolved: resolvedConfig } = getLoadedConfig();
                const plugins = config.plugins ?? [];

                astroReadsForwardedFor = astroConfig.security.allowedDomains.length > 0;

                const { generateClientTypes } = await import('@/codegen/type-generator');
                injectTypes({
                    filename: 'astromech.d.ts',
                    content: generateClientTypes(resolvedConfig, plugins),
                });

                const {
                    generateMethodManifest,
                    serialiseMethodManifest,
                    METHOD_MANIFEST_FILENAME,
                } = await import('@/codegen/method-manifest');
                const manifestJson = serialiseMethodManifest(
                    generateMethodManifest(resolvedConfig, plugins)
                );
                const { writeFile, mkdir } = await import('node:fs/promises');
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
            // the config lives in the serving process.
            'astro:server:setup': async ({ logger }) => {
                const { config, resolved } = getLoadedConfig();
                logger.info('Astromech dev server ready');
                await runMigrations(
                    config.db.getInstance(),
                    logger,
                    config.plugins ?? [],
                    resolved.migrationsDir
                );
            },

            // Before Astro prerenders a page. The wrangler proxy a D1 binding
            // opened is closed again before the Cloudflare adapter's prerenderer
            // opens the same local state.
            'astro:build:start': async ({ logger }) => {
                const { config, resolved } = getLoadedConfig();
                await runMigrations(
                    config.db.getInstance(),
                    logger,
                    config.plugins ?? [],
                    resolved.migrationsDir
                );
                await disposeBindings();
            },
        },
    };
}

/**
 * The app's migration names for the build to bundle, or null when the site has
 * no chain. A chain that fails to load is warned about rather than failing the
 * build, since `db:init` reports it too.
 */
async function bundleMigrationNames(
    dir: string,
    warn: (message: string) => void
): Promise<string[] | null> {
    try {
        return await listAppMigrationNames(dir);
    } catch (error) {
        warn(
            `Could not read the migrations in ${dir}, so the build bundles none: ` +
                (error instanceof Error ? error.message : String(error))
        );
        return null;
    }
}

/**
 * Throw when `react()` comes before `astromech()`. The admin's router plugin has
 * to run before React's transform, and Astro adds Vite plugins in integration order.
 */
function assertIntegrationOrder(integrations: AstroIntegration[]): void {
    const names = integrations.map((integration) => integration.name);
    const react = names.indexOf('@astrojs/react');
    if (react !== -1 && react < names.indexOf('astromech')) {
        throw new AstromechError(
            "astromech() must come before react() in `integrations`. The admin splits its routes into chunks with the TanStack Router plugin, which has to run before React's transform, and Astro adds Vite plugins in integration order. Use `integrations: [astromech(), react()]`."
        );
    }
}
