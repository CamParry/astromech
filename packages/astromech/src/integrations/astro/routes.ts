/**
 * Registration of the media, admin shell and API routes, and which of them
 * serves a path. Auth and plugin routes are not injected here: they mount inside
 * the Hono app under `${basePath}/api/*`, already served by the catch-all below.
 */

import type { ResolvedConfig } from '@/types/index';

/**
 * Register the injected Astro routes. `shellEntrypoint` is the admin
 * package's shell page, as an absolute path.
 */
export function registerRoutes(
    injectRoute: (route: {
        pattern: string;
        entrypoint: string;
        prerender: boolean;
    }) => void,
    resolvedConfig: ResolvedConfig,
    shellEntrypoint: string
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

    // Admin SPA shell: a catch-all that serves the React SPA for every admin path
    injectRoute({
        pattern: `${basePath}/[...path]`,
        entrypoint: shellEntrypoint,
        prerender: false,
    });

    // API routes (catch-all)
    injectRoute({
        pattern: `${basePath}/api/[...path]`,
        entrypoint: 'astromech/routes/handler.ts',
        prerender: false,
    });
}

/**
 * Which injected route serves `pathname`: `admin` for the shell and the API
 * under `basePath`, `media` for the media route, or undefined for a site page.
 */
export function resolveInjectedRoute(
    resolvedConfig: Pick<ResolvedConfig, 'basePath' | 'mediaRoute'>,
    pathname: string
): 'admin' | 'media' | undefined {
    const { basePath, mediaRoute } = resolvedConfig;
    if (isUnder(pathname, mediaRoute)) return 'media';
    if (isUnder(pathname, basePath)) return 'admin';
    return undefined;
}

/** True for `prefix` itself and every path below it. */
function isUnder(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
