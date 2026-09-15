/**
 * `registerRoutes()`: the three patterns it injects, that the admin shell is a
 * file that exists, and that each package entrypoint resolves through both
 * exports maps to a file that exists.
 */
import { existsSync } from 'node:fs';
import { createAdminViteConfig } from '@astromech/admin/vite';
import { makeTestConfig } from '@tests/harness';
import { findMissingExportTargets } from '@tests/package-exports';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/config/resolve';
import { registerRoutes } from '@/integrations/astro/routes';

type InjectedRoute = { pattern: string; entrypoint: string; prerender: boolean };

const { shellEntrypoint } = createAdminViteConfig();

function recordRoutes(): InjectedRoute[] {
    const routes: InjectedRoute[] = [];
    const resolved = resolveConfig({
        ...makeTestConfig(),
        basePath: '/admin',
        mediaRoute: '/files',
    });
    registerRoutes((route) => routes.push(route), resolved, shellEntrypoint);
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
                entrypoint: shellEntrypoint,
                prerender: false,
            },
            {
                pattern: '/admin/api/[...path]',
                entrypoint: 'astromech/routes/handler.ts',
                prerender: false,
            },
        ]);
    });

    it('points the admin shell at a file that exists', () => {
        expect(existsSync(shellEntrypoint)).toBe(true);
    });

    const packageEntrypoints = routes
        .map((route) => route.entrypoint)
        .filter((entrypoint) => entrypoint.startsWith('astromech/'));

    it.each([...new Set(packageEntrypoints)])(
        'resolves %s through both exports maps to a file that exists',
        (entrypoint) => {
            expect(findMissingExportTargets(entrypoint)).toEqual([]);
        }
    );
});
