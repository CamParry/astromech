/**
 * Route Registration
 * Handles registration of API and auth routes
 */

import type { AstromechPlugin, ResolvedConfig } from '@/types/index.js';

/**
 * Register all API and auth routes
 *
 * @param injectRoute - Astro's route injection function
 * @param resolvedConfig - Resolved Astromech configuration
 * @param plugins - Installed plugins
 */
export function registerRoutes(
	injectRoute: (route: { pattern: string; entrypoint: string; prerender: boolean }) => void,
	resolvedConfig: ResolvedConfig,
	plugins: AstromechPlugin[]
): void {
	const { apiRoute } = resolvedConfig;

	// Auth API route (must be before the catch-all API route)
	injectRoute({
		pattern: `${apiRoute}/auth/[...all]`,
		entrypoint: 'astromech/routes/auth-handler.ts',
		prerender: false,
	});

	// Admin SPA shell — catch-all that serves the React SPA for all /admin/* paths
	injectRoute({
		pattern: `${resolvedConfig.adminRoute}/[...path]`,
		entrypoint: 'astromech/admin/shell.astro',
		prerender: false,
	});

	// API routes (catch-all — must be after auth route)
	injectRoute({
		pattern: `${apiRoute}/[...path]`,
		entrypoint: 'astromech/routes/api.ts',
		prerender: false,
	});

	// Plugin routes
	for (const plugin of plugins) {
		for (const route of plugin.routes ?? []) {
			injectRoute({
				pattern: route.path,
				entrypoint: 'astromech/routes/plugin-handler.ts',
				prerender: false,
			});
		}
	}
}
