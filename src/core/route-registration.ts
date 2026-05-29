/**
 * Route Registration
 * Handles registration of API and auth routes.
 *
 * Plugin routes are NOT injected here: plugin RPC and raw routes mount inside
 * the existing Hono app under `/api/plugins/*`, which the `${apiRoute}/[...path]`
 * catch-all already serves. Plugins cannot register routes outside `/api`.
 */

import type { ResolvedConfig } from '@/types/index.js';

/**
 * Register all API and auth routes
 *
 * @param injectRoute - Astro's route injection function
 * @param resolvedConfig - Resolved Astromech configuration
 */
export function registerRoutes(
	injectRoute: (route: { pattern: string; entrypoint: string; prerender: boolean }) => void,
	resolvedConfig: ResolvedConfig
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
}
