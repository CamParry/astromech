/**
 * `definePlugin` — the scoped table factory plugins use to declare their schema.
 *
 * The value it adds over `defineTable` is namespacing: the table name and every
 * declared index name get the `plugin_<alias>_` prefix, and nothing else is
 * touched. These tests pin both halves — what is prefixed, and what is passed
 * through untouched.
 */

import { describe, expect, it } from 'vitest';
import { definePlugin } from '@/database/define-plugin.js';
import type { TableDescriptor } from '@/database/define-table.js';

describe('definePlugin – table naming', () => {
    it('prefixes the table name with plugin_<alias>_', () => {
        const tables = definePlugin({
            alias: 'backups',
            schema: ({ table }) => ({
                runs: table('runs', ({ col }) => ({
                    id: col.id(),
                    status: col.text({ notNull: true }),
                })),
            }),
        });

        expect(tables.runs.name).toBe('plugin_backups_runs');
    });

    it('keys the returned record by the author schema keys, unchanged', () => {
        const tables = definePlugin({
            alias: 'redirects',
            schema: ({ table }) => ({
                redirects: table('redirects', ({ col }) => ({ id: col.id() })),
                hits: table('hit_log', ({ col }) => ({ id: col.id() })),
            }),
        });

        expect(Object.keys(tables)).toEqual(['redirects', 'hits']);
        expect(tables.hits.name).toBe('plugin_redirects_hit_log');
    });

    it('throws when handed an already-prefixed table name', () => {
        expect(() =>
            definePlugin({
                alias: 'backups',
                schema: ({ table }) => ({
                    runs: table('plugin_backups_runs', ({ col }) => ({ id: col.id() })),
                }),
            })
        ).toThrow(/already prefixed/);
    });
});

describe('definePlugin – alias validation', () => {
    it('accepts lowercase letters, digits and hyphens', () => {
        const tables = definePlugin({
            alias: 'my-plugin-2',
            schema: ({ table }) => ({
                thing: table('thing', ({ col }) => ({ id: col.id() })),
            }),
        });

        expect(tables.thing.name).toBe('plugin_my-plugin-2_thing');
    });

    it.each([
        ['uppercase', 'Backups'],
        ['underscore', 'my_plugin'],
        ['empty', ''],
        ['scoped package name', '@scope/name'],
    ])('throws for a %s alias', (_label, alias) => {
        expect(() =>
            definePlugin({
                alias,
                schema: ({ table }) => ({
                    thing: table('thing', ({ col }) => ({ id: col.id() })),
                }),
            })
        ).toThrow(/alias .* is invalid/);
    });
});

describe('definePlugin – index naming', () => {
    it('prefixes explicit index names so two plugins may both declare idx_lookup', () => {
        const one = definePlugin({
            alias: 'redirects',
            schema: ({ table }) => ({
                links: table(
                    'links',
                    ({ col }) => ({ id: col.id(), from: col.text({ notNull: true }) }),
                    ({ index }) => [index('idx_lookup', ['from'], { unique: true })]
                ),
            }),
        });
        const two = definePlugin({
            alias: 'backups',
            schema: ({ table }) => ({
                runs: table(
                    'runs',
                    ({ col }) => ({ id: col.id(), from: col.text({ notNull: true }) }),
                    ({ index }) => [index('idx_lookup', ['from'])]
                ),
            }),
        });

        expect(one.links.indexes[0]?.name).toBe('plugin_redirects_idx_lookup');
        expect(two.runs.indexes[0]?.name).toBe('plugin_backups_idx_lookup');
    });

    it('leaves index columns, uniqueness and partial-index predicates untouched', () => {
        const tables = definePlugin({
            alias: 'redirects',
            schema: ({ table }) => ({
                links: table(
                    'links',
                    ({ col }) => ({
                        id: col.id(),
                        from: col.text({ notNull: true }),
                        enabled: col.boolean({ notNull: true, default: true }),
                    }),
                    ({ index }) => [
                        index('idx_from', ['from', 'enabled'], {
                            unique: true,
                            where: 'enabled = 1',
                        }),
                    ]
                ),
            }),
        });

        expect(tables.links.indexes).toEqual([
            {
                name: 'plugin_redirects_idx_from',
                columns: ['from', 'enabled'],
                unique: true,
                where: 'enabled = 1',
            },
        ]);
    });

    it('yields an empty index list when none are declared', () => {
        const tables = definePlugin({
            alias: 'backups',
            schema: ({ table }) => ({
                runs: table('runs', ({ col }) => ({ id: col.id() })),
            }),
        });

        expect(tables.runs.indexes).toEqual([]);
    });
});

describe('definePlugin – descriptor passthrough', () => {
    it('passes every column through to the descriptor with its keys intact', () => {
        const tables = definePlugin({
            alias: 'backups',
            schema: ({ table }) => ({
                runs: table('runs', ({ col }) => ({
                    id: col.id(),
                    status: col.enum(['pending', 'done'], {
                        notNull: true,
                        default: 'pending',
                    }),
                    sizeBytes: col.integer(),
                    meta: col.json<{ note: string }>(),
                    startedAt: col.timestamp({ notNull: true, defaultNow: true }),
                })),
            }),
        });

        expect(Object.keys(tables.runs.columns)).toEqual([
            'id',
            'status',
            'sizeBytes',
            'meta',
            'startedAt',
        ]);
    });

    it('preserves a representative column’s runtime facts', () => {
        const tables = definePlugin({
            alias: 'backups',
            schema: ({ table }) => ({
                runs: table('runs', ({ col }) => ({
                    id: col.id(),
                    status: col.text({ notNull: true, default: 'pending' }),
                })),
            }),
        });

        const status = tables.runs.columns.status;
        expect(status.kind).toBe('text');
        expect(status.notNull).toBe(true);
        expect(status.primaryKey).toBe(false);
        expect(status.sqlDefault).toBe('pending');
        expect(status.appDefault).toBeUndefined();

        const id = tables.runs.columns.id;
        expect(id.kind).toBe('id');
        expect(id.primaryKey).toBe(true);
        expect(id.notNull).toBe(true);
        expect(id.appDefault).toBe('ulid');
        expect(id.sqlDefault).toBeUndefined();
    });

    it('returns descriptors shaped exactly like defineTable output', () => {
        const tables = definePlugin({
            alias: 'backups',
            schema: ({ table }) => ({
                runs: table('runs', ({ col }) => ({ id: col.id() })),
            }),
        });

        const descriptor: TableDescriptor = tables.runs;
        expect(Object.keys(descriptor).sort()).toEqual(['columns', 'indexes', 'name']);
    });
});
