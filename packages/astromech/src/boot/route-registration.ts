/**
 * Route Registration
 * Handles registration of API and auth routes.
 *
 * Plugin routes are not injected here: plugin RPC and raw routes mount inside
 * the Hono app under `${basePath}/api/plugins/*`, which the
 * `${basePath}/api/[...path]` catch-all already serves.
 */

import type { ResolvedConfig } from '@/types/index';

/**
 * Register all API and auth routes
 *
 * @param injectRoute - Astro's route injection function
 * @param resolvedConfig - Resolved Astromech configuration
 */
export function registerRoutes(
    injectRoute: (route: {
        pattern: string;
        entrypoint: string;
        prerender: boolean;
    }) => void,
    resolvedConfig: ResolvedConfig
): void {
    const { basePath, mediaRoute } = resolvedConfig;

    // Auth API route (must be before the catch-all API route)
    injectRoute({
        pattern: `${basePath}/api/auth/[...all]`,
        entrypoint: 'astromech/routes/auth-handler.ts',
        prerender: false,
    });

    // Media serving route — top-level, app-owned canonical media URL
    // (`${mediaRoute}/<id>.<ext>[?w&f&v]`). Serves originals (stream) and
    // on-demand, allowlisted image variants. Mounted like the auth route.
    injectRoute({
        pattern: `${mediaRoute}/[...path]`,
        entrypoint: 'astromech/routes/media-handler.ts',
        prerender: false,
    });

    // Admin SPA shell — catch-all that serves the React SPA for all admin paths
    injectRoute({
        pattern: `${basePath}/[...path]`,
        entrypoint: 'astromech/admin/shell.astro',
        prerender: false,
    });

    // API routes (catch-all — must be after auth route)
    injectRoute({
        pattern: `${basePath}/api/[...path]`,
        entrypoint: 'astromech/routes/api.ts',
        prerender: false,
    });
}
