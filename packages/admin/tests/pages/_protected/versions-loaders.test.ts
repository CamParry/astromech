/**
 * The version history routes' loaders. A locale with no row has no versions,
 * and the versions read answers 404 for it, so each loader reads the row first
 * and asks for the versions only when the row exists.
 *
 * This drives the REAL loaders exported by the page modules, over a stand-in
 * query client that answers by query key.
 */

import type { QueryKey } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { Route as entryVersionsRoute } from '@/admin/pages/_protected/entries/$type/$id/versions';
import { Route as globalVersionsRoute } from '@/admin/pages/_protected/globals/$key/versions';

type Loader = (arg: {
    context: {
        queryClient: { ensureQueryData: (options: { queryKey: QueryKey }) => unknown };
    };
    params: Record<string, string>;
    deps: { locale: string | undefined };
}) => Promise<unknown>;

/** Run a route's loader with `row` as the canonical read; return the keys it ensured. */
async function runLoader(
    route: { options: { loader?: unknown } },
    params: Record<string, string>,
    rowKey: QueryKey,
    row: unknown
): Promise<QueryKey[]> {
    const ensureQueryData = vi.fn(async ({ queryKey }: { queryKey: QueryKey }) =>
        JSON.stringify(queryKey) === JSON.stringify(rowKey) ? row : []
    );
    const loader = route.options.loader as Loader;
    await loader({
        context: { queryClient: { ensureQueryData } },
        params,
        deps: { locale: 'en' },
    });
    return ensureQueryData.mock.calls.map(([options]) => options.queryKey);
}

describe('the global versions loader', () => {
    const rowKey = queryKeys.globals.get('site', 'en');

    it('reads the versions of a locale that has a row', async () => {
        const keys = await runLoader(globalVersionsRoute, { key: 'site' }, rowKey, {
            fields: {},
        });
        expect(keys).toEqual([rowKey, queryKeys.globals.versions('site', 'en')]);
    });

    it('asks for no versions for a locale never saved', async () => {
        const keys = await runLoader(globalVersionsRoute, { key: 'site' }, rowKey, null);
        expect(keys).toEqual([rowKey]);
    });
});

describe('the entry versions loader', () => {
    const params = { type: 'post', id: 'e1' };
    const rowKey = queryKeys.entries.get('post', 'e1', 'en');

    it('reads the versions of a locale that has a row', async () => {
        const keys = await runLoader(entryVersionsRoute, params, rowKey, { id: 'e1' });
        expect(keys).toEqual([rowKey, queryKeys.entries.versions('post', 'e1', 'en')]);
    });

    it('asks for no versions for a locale with no row', async () => {
        const keys = await runLoader(entryVersionsRoute, params, rowKey, null);
        expect(keys).toEqual([rowKey]);
    });
});
