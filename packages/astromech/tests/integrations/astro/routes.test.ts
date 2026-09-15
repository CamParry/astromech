/**
 * `registerRoutes()`: the three patterns it injects, and that each entrypoint
 * resolves through both exports maps to a file that exists.
 */
import { makeTestConfig } from '@tests/harness';
import { findMissingExportTargets } from '@tests/package-exports';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/config/resolve';
import { registerRoutes } from '@/integrations/astro/routes';

type InjectedRoute = { pattern: string; entrypoint: string; prerender: boolean };

function recordRoutes(): InjectedRoute[] {
    const routes: InjectedRoute[] = [];
    const resolved = resolveConfig({
        ...makeTestConfig(),
        basePath: '/admin',
        mediaRoute: '/files',
    });
    registerRoutes((route) => routes.push(route), resolved);
    return routes;
}

describe('registerRoutes()', () => {
    const routes = recordRoutes();

    it('injects the media, admin shell and API routes from basePath and mediaRoute', () => {
        expect(routes).toEqual([
            {
                pattern: '/files/[...path]',
                entrypoint: 'astromech/routes/handler.ts',
                prerender: false,
            },
            {
                pattern: '/admin/[...path]',
                entrypoint: 'astromech/admin/shell.astro',
                prerender: false,
            },
            {
                pattern: '/admin/api/[...path]',
                entrypoint: 'astromech/routes/handler.ts',
                prerender: false,
            },
        ]);
    });

    it.each([...new Set(routes.map((route) => route.entrypoint))])(
        'resolves %s through both exports maps to a file that exists',
        (entrypoint) => {
            expect(findMissingExportTargets(entrypoint)).toEqual([]);
        }
    );
});
