/**
 * `defineConfig` checks a site's config against `AstromechConfig`. `typecheck`
 * checks this file; vitest does not run it.
 */

import type { AstromechConfig, DatabaseDriver, StorageDriver } from 'astromech';
import type { MigrationProvider } from 'kysely/migration';
import { defineConfig } from 'astromech';
import { describe, expectTypeOf, it } from 'vitest';

declare const db: DatabaseDriver;
declare const storage: StorageDriver;
declare const migrations: MigrationProvider;

describe('defineConfig', () => {
    it('accepts a valid config and returns it as AstromechConfig', () => {
        const config = defineConfig({
            db,
            storage,
            migrations,
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
        defineConfig({ db, storage, migrations, entryTypes: {} });
    });

    it('rejects a field of the wrong type', () => {
        // @ts-expect-error `basePath` is a string.
        defineConfig({ db, storage, migrations, basePath: 1 });
    });

    it('rejects a config without its required keys', () => {
        // @ts-expect-error `storage` is required.
        defineConfig({ db, migrations });
    });

    it('rejects a config without its migration chain', () => {
        // @ts-expect-error `migrations` is required.
        defineConfig({ db, storage });
    });

    it('rejects an entry type missing its labels', () => {
        defineConfig({
            db,
            storage,
            migrations,
            // @ts-expect-error An entry type needs `single` and `plural`.
            entries: [{ type: 'post', single: 'Post' }],
        });
    });

    it('rejects an entry type without its `type`', () => {
        defineConfig({
            db,
            storage,
            migrations,
            // @ts-expect-error Every entry type names its own `type`.
            entries: [{ single: 'Post', plural: 'Posts' }],
        });
    });

    it('rejects entry types keyed by type', () => {
        defineConfig({
            db,
            storage,
            migrations,
            // @ts-expect-error `entries` is an array, not a record.
            entries: { post: { type: 'post', single: 'Post', plural: 'Posts' } },
        });
    });

    it('accepts a config without entry types', () => {
        expectTypeOf(
            defineConfig({ db, storage, migrations })
        ).toEqualTypeOf<AstromechConfig>();
    });
});
