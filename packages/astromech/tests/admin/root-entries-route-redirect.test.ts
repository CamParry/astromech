/**
 * @vitest-environment happy-dom
 *
 * The root `/entries/$type` routes must never render a qualified plugin type:
 * the page would emit `/entries/forms/form/<id>` links that 404. Each root
 * route's `beforeLoad` redirects to the canonical plugin route instead.
 *
 * This drives the REAL route options exported by the page modules, so a route
 * that loses its `beforeLoad` fails here.
 */

import { describe, expect, it } from 'vitest';
import { isRedirect } from '@tanstack/react-router';
import { Route as listRoute } from '@/admin/pages/_protected/entries/$type/index';
import { Route as newRoute } from '@/admin/pages/_protected/entries/$type/new';
import { Route as editRoute } from '@/admin/pages/_protected/entries/$type/$id/index';
import { Route as versionsRoute } from '@/admin/pages/_protected/entries/$type/$id/versions';

type BeforeLoad = (arg: {
    params: Record<string, string>;
    search: Record<string, unknown>;
}) => unknown;

/** Run a route's `beforeLoad` and return the navigation options it redirected to, if any. */
function runBeforeLoad(
    route: { options: { beforeLoad?: unknown } },
    params: Record<string, string>,
    search: Record<string, unknown> = {}
): { to?: string; params?: Record<string, string> } | null {
    const beforeLoad = route.options.beforeLoad as BeforeLoad;
    try {
        beforeLoad({ params, search });
        return null;
    } catch (error) {
        if (!isRedirect(error)) throw error;
        // `redirect()` returns a Response carrying the navigation options.
        return (
            error as unknown as {
                options: { to?: string; params?: Record<string, string> };
            }
        ).options;
    }
}

describe('root entries routes with a qualified type', () => {
    it('redirects the list route to the plugin list route', () => {
        expect(runBeforeLoad(listRoute, { type: 'forms/form' })).toMatchObject({
            to: '/plugin/$name/entries/$type',
            params: { name: 'forms', type: 'form' },
        });
    });

    it('redirects the create route to the plugin create route', () => {
        expect(runBeforeLoad(newRoute, { type: 'forms/form' })).toMatchObject({
            to: '/plugin/$name/entries/$type/new',
            params: { name: 'forms', type: 'form' },
        });
    });

    it('redirects the edit route, carrying the entry id', () => {
        expect(
            runBeforeLoad(editRoute, { type: 'forms/form', id: 'abc123' })
        ).toMatchObject({
            to: '/plugin/$name/entries/$type/$id',
            params: { name: 'forms', type: 'form', id: 'abc123' },
        });
    });

    it('redirects the versions route, carrying the entry id', () => {
        expect(
            runBeforeLoad(versionsRoute, { type: 'forms/form', id: 'abc123' })
        ).toMatchObject({
            to: '/plugin/$name/entries/$type/$id/versions',
            params: { name: 'forms', type: 'form', id: 'abc123' },
        });
    });
});

describe('root entries routes with a bare type', () => {
    it('renders in place rather than redirecting', () => {
        expect(runBeforeLoad(listRoute, { type: 'post' })).toBeNull();
        expect(runBeforeLoad(newRoute, { type: 'post' })).toBeNull();
        expect(runBeforeLoad(editRoute, { type: 'post', id: 'abc123' })).toBeNull();
        expect(runBeforeLoad(versionsRoute, { type: 'post', id: 'abc123' })).toBeNull();
    });
});
