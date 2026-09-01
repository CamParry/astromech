/**
 * An entry has one id across its locales, so the locale is part of every
 * entry-detail cache key. Without it the edit page would show the locale it
 * last fetched after a switch, and the versions list would show another
 * locale's history.
 */

import { describe, expect, it } from 'vitest';
import { entryQueryOptions, entryVersionsQueryOptions } from '@/admin/hooks/entries';
import { queryKeys, scopedEntryKeys } from '@/admin/hooks/use-query-keys';

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

    it('namespaces a plugin type the same way', () => {
        const keys = scopedEntryKeys('forms');
        expect(keys.get('forms/form', 'e1', 'en')).not.toEqual(
            keys.get('forms/form', 'e1', 'fr')
        );
        expect(keys.get('forms/form', 'e1', 'en')).not.toEqual([
            ...queryKeys.entries.get('forms/form', 'e1', 'en'),
        ]);
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
