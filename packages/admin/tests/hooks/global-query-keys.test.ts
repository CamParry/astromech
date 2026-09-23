/**
 * A global is addressed by key alone, so the locale is the only thing that
 * separates two rows of it in the cache. Without it in the key the edit page
 * would show the locale it last fetched after a switch, and the versions list
 * would show another locale's history.
 */

import { describe, expect, it } from 'vitest';
import { globalQueryOptions, globalVersionsQueryOptions } from '@/admin/hooks/globals';
import { queryKeys } from '@/admin/hooks/use-query-keys';

describe('global detail keys', () => {
    it('separates two locales of the same global', () => {
        expect(queryKeys.globals.get('site', 'en')).not.toEqual(
            queryKeys.globals.get('site', 'fr')
        );
        expect(queryKeys.globals.versions('site', 'en')).not.toEqual(
            queryKeys.globals.versions('site', 'fr')
        );
        expect(queryKeys.globals.staged('site', 'en')).not.toEqual(
            queryKeys.globals.staged('site', 'fr')
        );
    });

    it('separates the staged change from the canonical row', () => {
        expect(queryKeys.globals.staged('site', 'en')).not.toEqual(
            queryKeys.globals.get('site', 'en')
        );
    });

    it('stays under the global key, so one invalidation reaches them all', () => {
        const all = queryKeys.globals.all('site');
        expect(queryKeys.globals.get('site', 'en').slice(0, all.length)).toEqual([
            ...all,
        ]);
        expect(queryKeys.globals.versions('site', 'en').slice(0, all.length)).toEqual([
            ...all,
        ]);
        expect(queryKeys.globals.staged('site', 'en').slice(0, all.length)).toEqual([
            ...all,
        ]);
    });

    it('keys a plugin global by its qualified id, apart from a site global of the same key', () => {
        expect(queryKeys.globals.all('seo/settings')).not.toEqual(
            queryKeys.globals.all('settings')
        );
    });
});

describe('the query options the routes prefetch with', () => {
    it('keys the global read on its locale', () => {
        expect(globalQueryOptions('site', 'fr').queryKey).toEqual([
            ...queryKeys.globals.get('site', 'fr'),
        ]);
    });

    it('keys the version list on its locale', () => {
        expect(globalVersionsQueryOptions('site', 'fr').queryKey).toEqual([
            ...queryKeys.globals.versions('site', 'fr'),
        ]);
    });
});
