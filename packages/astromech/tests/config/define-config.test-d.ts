/**
 * `defineConfig` checks a site's config against `AstromechConfig`. `typecheck`
 * checks this file; vitest does not run it.
 */

import type { AstromechConfig, DatabaseDriver, StorageDriver } from 'astromech';
import { defineConfig } from 'astromech';
import { describe, expectTypeOf, it } from 'vitest';

declare const db: DatabaseDriver;
declare const storage: StorageDriver;

describe('defineConfig', () => {
    it('accepts a valid config and returns it as AstromechConfig', () => {
        const config = defineConfig({
            db,
            storage,
            basePath: '/admin',
            entries: {
                post: {
                    single: 'Post',
                    plural: 'Posts',
                    fields: [{ name: 'body', type: 'text', label: 'Body' }],
                },
            },
        });

        expectTypeOf(config).toEqualTypeOf<AstromechConfig>();
    });

    it('rejects an unknown top-level key', () => {
        // @ts-expect-error `entryTypes` is not a config key (it is `entries`).
        defineConfig({ db, storage, entries: {}, entryTypes: {} });
    });

    it('rejects a field of the wrong type', () => {
        // @ts-expect-error `basePath` is a string.
        defineConfig({ db, storage, entries: {}, basePath: 1 });
    });

    it('rejects a config without its required keys', () => {
        // @ts-expect-error `entries` is required.
        defineConfig({ db, storage });
    });

    it('rejects an entry type missing its labels', () => {
        // @ts-expect-error An entry type needs `single` and `plural`.
        defineConfig({ db, storage, entries: { post: { single: 'Post' } } });
    });
});
