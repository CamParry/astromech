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
            entries: [
                {
                    type: 'post',
                    single: 'Post',
                    plural: 'Posts',
                    fields: [{ name: 'body', type: 'text', label: 'Body' }],
                },
            ],
        });

        expectTypeOf(config).toEqualTypeOf<AstromechConfig>();
    });

    it('rejects an unknown top-level key', () => {
        // @ts-expect-error `entryTypes` is not a config key (it is `entries`).
        defineConfig({ db, storage, entryTypes: {} });
    });

    it('rejects a field of the wrong type', () => {
        // @ts-expect-error `basePath` is a string.
        defineConfig({ db, storage, basePath: 1 });
    });

    it('rejects a config without its required keys', () => {
        // @ts-expect-error `storage` is required.
        defineConfig({ db });
    });

    it('rejects an entry type missing its labels', () => {
        // @ts-expect-error An entry type needs `single` and `plural`.
        defineConfig({ db, storage, entries: [{ type: 'post', single: 'Post' }] });
    });

    it('rejects an entry type without its `type`', () => {
        // @ts-expect-error Every entry type names its own `type`.
        defineConfig({ db, storage, entries: [{ single: 'Post', plural: 'Posts' }] });
    });

    it('rejects entry types keyed by type', () => {
        defineConfig({
            db,
            storage,
            // @ts-expect-error `entries` is an array, not a record.
            entries: { post: { type: 'post', single: 'Post', plural: 'Posts' } },
        });
    });

    it('accepts a config without entry types', () => {
        expectTypeOf(defineConfig({ db, storage })).toEqualTypeOf<AstromechConfig>();
    });
});
