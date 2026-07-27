/**
 * `definePluginTable` — the scoped table factory plugins use to declare a table.
 *
 * The value it adds over `defineTable` is namespacing: the table name and every
 * declared index name get the `plugin_<namespace>_` prefix derived from the
 * plugin's `package`, and nothing else is touched. These tests pin both halves
 * — what is prefixed, and what is passed through untouched.
 */

import { describe, expect, it } from 'vitest';
import { definePluginTable } from '@/database/define-plugin-table.js';
import type { TableDescriptor } from '@/database/define-table.js';

const backups = { package: '@astromech/backups' } as const;
const redirects = { package: '@astromech/redirects' } as const;

describe('definePluginTable – table naming', () => {
    it('prefixes the table name with plugin_<namespace>_', () => {
        const runs = definePluginTable(backups, 'runs', ({ col }) => ({
            id: col.id(),
            status: col.text({ notNull: true }),
        }));

        expect(runs.name).toBe('plugin_backups_runs');
    });

    it('derives the namespace from the package, not a declared alias', () => {
        const settings = definePluginTable(
            { package: '@acme/seo' } as const,
            'settings',
            ({ col }) => ({ id: col.id() })
        );

        expect(settings.name).toBe('plugin_acme_seo_settings');
    });

    it('keeps the bare table name verbatim', () => {
        const hits = definePluginTable(redirects, 'hit_log', ({ col }) => ({
            id: col.id(),
        }));

        expect(hits.name).toBe('plugin_redirects_hit_log');
    });

    it('throws when handed an already-prefixed table name', () => {
        expect(() =>
            definePluginTable(backups, 'plugin_backups_runs', ({ col }) => ({
                id: col.id(),
            }))
        ).toThrow(/already prefixed/);
    });

    it.each([
        ['uppercase', 'Runs'],
        ['hyphen', 'backup-runs'],
        ['empty', ''],
        ['slash', 'a/b'],
    ])('throws for a %s table name', (_label, name) => {
        expect(() =>
            definePluginTable(backups, name, ({ col }) => ({ id: col.id() }))
        ).toThrow(/is invalid/);
    });
});

describe('definePluginTable – index naming', () => {
    it('prefixes explicit index names so two plugins may both declare idx_lookup', () => {
        const links = definePluginTable(
            redirects,
            'links',
            ({ col }) => ({ id: col.id(), from: col.text({ notNull: true }) }),
            ({ index }) => [index('idx_lookup', ['from'], { unique: true })]
        );
        const runs = definePluginTable(
            backups,
            'runs',
            ({ col }) => ({ id: col.id(), from: col.text({ notNull: true }) }),
            ({ index }) => [index('idx_lookup', ['from'])]
        );

        expect(links.indexes[0]?.name).toBe('plugin_redirects_idx_lookup');
        expect(runs.indexes[0]?.name).toBe('plugin_backups_idx_lookup');
    });

    it('leaves index columns, uniqueness and partial-index predicates untouched', () => {
        const links = definePluginTable(
            redirects,
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
        );

        expect(links.indexes).toEqual([
            {
                name: 'plugin_redirects_idx_from',
                columns: ['from', 'enabled'],
                unique: true,
                where: 'enabled = 1',
            },
        ]);
    });

    it('yields an empty index list when none are declared', () => {
        const runs = definePluginTable(backups, 'runs', ({ col }) => ({ id: col.id() }));

        expect(runs.indexes).toEqual([]);
    });
});

describe('definePluginTable – descriptor passthrough', () => {
    it('passes every column through to the descriptor with its keys intact', () => {
        const runs = definePluginTable(backups, 'runs', ({ col }) => ({
            id: col.id(),
            status: col.enum(['pending', 'done'], {
                notNull: true,
                default: 'pending',
            }),
            sizeBytes: col.integer(),
            meta: col.json<{ note: string }>(),
            startedAt: col.timestamp({ notNull: true, defaultNow: true }),
        }));

        expect(Object.keys(runs.columns)).toEqual([
            'id',
            'status',
            'sizeBytes',
            'meta',
            'startedAt',
        ]);
    });

    it('preserves a representative column’s runtime facts', () => {
        const runs = definePluginTable(backups, 'runs', ({ col }) => ({
            id: col.id(),
            status: col.text({ notNull: true, default: 'pending' }),
        }));

        const status = runs.columns.status;
        expect(status.kind).toBe('text');
        expect(status.notNull).toBe(true);
        expect(status.primaryKey).toBe(false);
        expect(status.sqlDefault).toBe('pending');
        expect(status.appDefault).toBeUndefined();

        const id = runs.columns.id;
        expect(id.kind).toBe('id');
        expect(id.primaryKey).toBe(true);
        expect(id.notNull).toBe(true);
        expect(id.appDefault).toBe('ulid');
        expect(id.sqlDefault).toBeUndefined();
    });

    it('returns descriptors shaped exactly like defineTable output', () => {
        const runs = definePluginTable(backups, 'runs', ({ col }) => ({ id: col.id() }));

        const descriptor: TableDescriptor = runs;
        expect(Object.keys(descriptor).sort()).toEqual(['columns', 'indexes', 'name']);
    });
});
