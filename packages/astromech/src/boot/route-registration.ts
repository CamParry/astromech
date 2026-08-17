/**
 * Route Registration
 * Handles registration of the media, admin shell and API routes.
 *
 * Auth and plugin routes are not injected here: they mount inside the Hono app
 * under `${basePath}/api/*`, which the `${basePath}/api/[...path]` catch-all
 * already serves.
 */

import type { ResolvedConfig } from '@/types/index';

/**
 * Register the injected Astro routes
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

    // Media serving route — top-level, app-owned canonical media URL
    // (`${mediaRoute}/<id>.<ext>[?w&f&v]`). Astro has to route the prefix into
    // the app; the Hono app serves it.
    injectRoute({
        pattern: `${mediaRoute}/[...path]`,
        entrypoint: 'astromech/routes/handler.ts',
        prerender: false,
    });

    // Admin SPA shell — catch-all that serves the React SPA for all admin paths
    injectRoute({
        pattern: `${basePath}/[...path]`,
        entrypoint: 'astromech/admin/shell.astro',
        prerender: false,
    });

    // API routes (catch-all)
    injectRoute({
        pattern: `${basePath}/api/[...path]`,
        entrypoint: 'astromech/routes/handler.ts',
        prerender: false,
    });
}
