/**
 * An entry has one id across its locales, so the locale is part of every
 * entry-detail cache key. Without it the edit page would show the locale it
 * last fetched after a switch, and the versions list would show another
 * locale's history.
 */

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
    entriesQueryOptions,
    entryQueryOptions,
    entryVersionsQueryOptions,
} from '@/admin/hooks/entries';
import { queryKeys } from '@/admin/hooks/use-query-keys';

describe('entry detail keys', () => {
    it('separates two locales of the same entry', () => {
        expect(queryKeys.entries.get('post', 'e1', 'en')).not.toEqual(
            queryKeys.entries.get('post', 'e1', 'fr')
        );
        expect(queryKeys.entries.versions('post', 'e1', 'en')).not.toEqual(
            queryKeys.entries.versions('post', 'e1', 'fr')
        );
        expect(queryKeys.entries.staged('post', 'e1', 'en')).not.toEqual(
            queryKeys.entries.staged('post', 'e1', 'fr')
        );
    });

    it('stays under the type key, so a list invalidation still reaches them', () => {
        const all = queryKeys.entries.all('post');
        expect(queryKeys.entries.get('post', 'e1', 'en').slice(0, all.length)).toEqual([
            ...all,
        ]);
    });

    it('keys a plugin type by its qualified id, apart from a site type of the same name', () => {
        expect(queryKeys.entries.all('forms/form')).not.toEqual(
            queryKeys.entries.all('form')
        );
    });
});

describe('the query options the routes prefetch with', () => {
    it('keys the entry read on its locale', () => {
        expect(entryQueryOptions('post', 'e1', 'fr').queryKey).toEqual([
            ...queryKeys.entries.get('post', 'e1', 'fr'),
        ]);
    });

    it('keys the version list on its locale', () => {
        expect(entryVersionsQueryOptions('post', 'e1', 'fr').queryKey).toEqual([
            ...queryKeys.entries.versions('post', 'e1', 'fr'),
        ]);
    });
});

describe('list reads', () => {
    it('go stale when an entry mutation invalidates their type', async () => {
        // The dashboard's counts read one-row pages; an entry mutation
        // invalidates `entries.all(type)`, which must reach them.
        const queryClient = new QueryClient();
        const count = entriesQueryOptions({ type: 'post', limit: 1 });
        queryClient.setQueryData(count.queryKey, { data: [], pagination: null });

        await queryClient.invalidateQueries({
            queryKey: queryKeys.entries.all('post'),
            refetchType: 'none',
        });

        expect(queryClient.getQueryState(count.queryKey)?.isInvalidated).toBe(true);
    });
});
