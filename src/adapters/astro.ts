/**
 * Astromech — Astro adapter
 *
 * Bridges astromech.config.ts with Astro's integration API.
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
import { resolveConfig } from '@/core/config-resolver.js';
import { resolveRoles } from '@/core/permissions.js';
import { registerRoutes } from '@/core/route-registration.js';
import { setStorageDriver } from '@/storage/registry.js';
import { setEmailConfig } from '@/email/registry.js';
import { setDb, getDb } from '@/db/registry.js';
import { registerBuiltInCronJobs } from '@/cron/index.js';

async function runMigrations(logger: { info: (msg: string) => void; error: (msg: string) => void }): Promise<void> {
	try {
		const { migrate } = await import('drizzle-orm/libsql/migrator');
		// dist/adapters/astro.js — go up two levels to reach package root drizzle/
		const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
		await migrate(getDb(), { migrationsFolder });
		logger.info('Astromech database migrations applied');
	} catch (err) {
		logger.error(
			`Astromech failed to apply migrations: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

export function astromech(config: AstromechConfig): AstroIntegration {
	const resolvedConfig = resolveConfig(config);
	// dist/adapters/astro.js — go up two levels to reach package src/
	const pkgSrc = fileURLToPath(new URL('../../src', import.meta.url));

	return {
		name: 'astromech',
		hooks: {
			'astro:config:setup': ({ updateConfig, injectRoute, addMiddleware, logger }) => {
				logger.info('Initializing Astromech CMS');

				setDb(config.db.getInstance());
				setStorageDriver(config.storage);
				if (config.email) {
					setEmailConfig(config.email);
				}
				registerBuiltInCronJobs();

				process.env.ASTROMECH_API_ROUTE = resolvedConfig.apiRoute;

				updateConfig({
					vite: {
						resolve: {
							alias: { '@/': pkgSrc + '/' },
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
							__ASTROMECH_ADMIN_ROUTE__: JSON.stringify(resolvedConfig.adminRoute),
							__ASTROMECH_API_ROUTE__: JSON.stringify(resolvedConfig.apiRoute),
						},
						plugins: [
						TanStackRouterVite({ routesDirectory: pkgSrc + '/admin/pages', generatedRouteTree: pkgSrc + '/admin/routeTree.gen.ts', routeToken: 'route' }),
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
										const resolvedRoles = resolveRoles(config);
										const adminConfig = {
											adminRoute: resolvedConfig.adminRoute,
											apiRoute: resolvedConfig.apiRoute,
											locales: resolvedConfig.locales ?? [],
											defaultLocale: resolvedConfig.defaultLocale ?? 'en',
											roles: Object.entries(resolvedRoles).map(([slug, r]) => ({ slug, name: r.name })),
											entries: Object.fromEntries(
												Object.entries(resolvedConfig.entries).map(
													([name, entryType]) => [
														name,
														{
															single: entryType.single,
															plural: entryType.plural,
															versioning: !!entryType.versioning,
															translatable: entryType.translatable ?? false,
															slug: entryType.slug ?? null,
															adminColumns: entryType.adminColumns ?? [],
															fieldGroups: entryType.fieldGroups,
															views: entryType.views,
															defaultView: entryType.defaultView,
															gridFields: entryType.gridFields,
															previewUrl: entryType.previewUrl ?? null,
														},
													]
												)
											),
										};
										return `export default ${JSON.stringify(adminConfig)};`;
									}
									return undefined;
								},
							},
						],
					},
				});

				registerRoutes(injectRoute, resolvedConfig, config.plugins ?? []);

				addMiddleware({
					entrypoint: 'astromech/middleware',
					order: 'pre',
				});

				logger.info(`Admin UI: ${resolvedConfig.adminRoute}, API: ${resolvedConfig.apiRoute}`);
				logger.info(`Entry types: ${Object.keys(resolvedConfig.entries).join(', ')}`);
			},

			'astro:config:done': async ({ injectTypes, logger }) => {
				const { generateSdkTypes } = await import('@/core/type-generator.js');
				injectTypes({
					filename: 'astromech.d.ts',
					content: generateSdkTypes(resolvedConfig),
				});
				logger.info('Astromech configuration complete');
			},

			'astro:server:setup': async ({ logger }) => {
				logger.info('Astromech dev server ready');
				await runMigrations(logger);
			},

			'astro:build:done': async ({ logger }) => {
				logger.info('Astromech build complete');
				await runMigrations(logger);
			},
		},
	};
}
