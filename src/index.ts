/**
 * Astromech - Astro CMS Integration
 *
 * A lightweight, fast Astro-based CMS that functions as an Astro integration.
 */

import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import type { AstromechConfig, AstromechPlugin, CollectionConfig } from '@/types/index.js';
import { resolveConfig } from '@/core/config-resolver.js';
import { registerRoutes } from '@/core/route-registration.js';
import { setStorageDriver } from '@/storage/registry.js';
import { setDb, getDb } from '@/db/registry.js';

// ============================================================================
// Type Exports
// ============================================================================

export * from '@/types/index.js';
export { FilesystemStorage } from '@/storage/filesystem.js';
export { libsqlDriver } from '@/db/drivers/libsql.js';
export { d1Driver } from '@/db/drivers/d1.js';

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Define a collection configuration with type inference
 */
export function defineCollection(config: CollectionConfig): CollectionConfig {
	return config;
}

/**
 * Define a plugin with type inference
 */
export function definePlugin(plugin: AstromechPlugin): AstromechPlugin {
	return plugin;
}

// ============================================================================
// Migration Runner
// ============================================================================

/**
 * Run pending Drizzle migrations against the configured database.
 * Migration files live in the package's drizzle/ folder and are resolved
 * relative to this file so they work both locally and when installed from npm.
 *
 * Long-term this will be exposed via `astromech db:init` CLI.
 */
async function runMigrations(logger: { info: (msg: string) => void; error: (msg: string) => void }): Promise<void> {
	try {
		const { migrate } = await import('drizzle-orm/libsql/migrator');
		const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
		await migrate(getDb(), { migrationsFolder });
		logger.info('Astromech database migrations applied');
	} catch (err) {
		logger.error(
			`Astromech failed to apply migrations: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

// ============================================================================
// Main Integration
// ============================================================================

/**
 * Create the Astromech Astro integration
 *
 * @param config - User-provided Astromech configuration
 * @returns Astro integration object
 */
export default function astromech(config: AstromechConfig): AstroIntegration {
	const resolvedConfig = resolveConfig(config);
	// Resolves to the package's src/ directory — works both locally (src/index.ts)
	// and from the published build (dist/index.js → ../src)
	const pkgSrc = fileURLToPath(new URL('../src', import.meta.url));

	return {
		name: 'astromech',
		hooks: {
			'astro:config:setup': ({ updateConfig, injectRoute, addMiddleware, logger }) => {
				logger.info('Initializing Astromech CMS');

				// Register the database and storage drivers in the globalThis
				// registry so the server SDK can access them at request time.
				setDb(config.db.getInstance());
				setStorageDriver(config.storage);

				// Make the resolved API route available to the auth module at runtime.
				// Better Auth needs basePath = `${apiRoute}/auth` to handle requests
				// correctly when the auth route is not the default `/api/auth`.
				process.env.ASTROMECH_API_ROUTE = resolvedConfig.apiRoute;

				// Inject virtual module for runtime config access
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
							{
								name: 'virtual:astromech/config',
								resolveId(id) {
									if (id === 'virtual:astromech/config') {
										return '\0virtual:astromech/config';
									}
								},
								load(id) {
									if (id === '\0virtual:astromech/config') {
										return `export default ${JSON.stringify(resolvedConfig)};`;
									}
								},
							},
							{
								// Exposes a safe, client-friendly subset of config to the admin SPA.
								// Does NOT include database/storage adapter instances.
								name: 'virtual:astromech/admin-config',
								resolveId(id) {
									if (id === 'virtual:astromech/admin-config') {
										return '\0virtual:astromech/admin-config';
									}
								},
								load(id) {
									if (id === '\0virtual:astromech/admin-config') {
										const adminConfig = {
											adminRoute: resolvedConfig.adminRoute,
											apiRoute: resolvedConfig.apiRoute,
											collections: Object.fromEntries(
												Object.entries(resolvedConfig.collections).map(
													([name, col]) => [
														name,
														{
															single: col.single,
															plural: col.plural,
															versioning: col.versioning ?? false,
															slug: col.slug ?? null,
															adminColumns: col.adminColumns ?? [],
															fieldGroups: col.fieldGroups,
															views: col.views,
															defaultView: col.defaultView,
															gridFields: col.gridFields,
								previewUrl: col.previewUrl ?? null,
														},
													]
												)
											),
										};
										return `export default ${JSON.stringify(adminConfig)};`;
									}
								},
							},
						],
					},
				});

				// Register all routes
				registerRoutes(injectRoute, resolvedConfig, config.plugins ?? []);

				// Add auth and API middleware
				addMiddleware({
					entrypoint: 'astromech/middleware',
					order: 'pre',
				});

				// Log initialization info
				logger.info(`Admin UI: ${resolvedConfig.adminRoute}, API: ${resolvedConfig.apiRoute}`);
				logger.info(`Collections: ${Object.keys(resolvedConfig.collections).join(', ')}`);
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
