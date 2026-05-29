import { describe, expect, it } from 'vitest';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PluginDefinition } from '@/types/index.js';
import { assertPluginTablePrefixes, collectPluginSchemas } from '@/core/plugin-schema.js';

const def = (partial: Partial<PluginDefinition> & { package: string }): PluginDefinition => ({
    ...partial,
});

describe('collectPluginSchemas', () => {
    it('flattens tables and tags them with the plugin alias', () => {
        const events = sqliteTable('plugin_analytics_events', {
            id: text('id').primaryKey(),
            count: integer('count'),
        });
        const collected = collectPluginSchemas([
            def({ package: '@astromech/analytics', schema: { events } }),
        ]);
        expect(collected).toHaveLength(1);
        expect(collected[0]).toMatchObject({
            alias: 'analytics',
            exportName: 'events',
            tableName: 'plugin_analytics_events',
        });
    });

    it('ignores non-table exports', () => {
        const collected = collectPluginSchemas([
            def({ package: '@astromech/x', schema: { notATable: { foo: 'bar' } } }),
        ]);
        expect(collected).toEqual([]);
    });
});

describe('assertPluginTablePrefixes', () => {
    it('passes when tables use the plugin_{alias}_ prefix', () => {
        const log = sqliteTable('plugin_audit_log', { id: text('id').primaryKey() });
        expect(() =>
            assertPluginTablePrefixes([def({ package: '@astromech/audit', schema: { log } })])
        ).not.toThrow();
    });

    it('throws when a table is missing the prefix', () => {
        const log = sqliteTable('audit_log', { id: text('id').primaryKey() });
        expect(() =>
            assertPluginTablePrefixes([def({ package: '@astromech/audit', schema: { log } })])
        ).toThrow(/plugin_audit_/);
    });

    it('uses the alias, not the package, for the prefix', () => {
        const log = sqliteTable('plugin_myredirects_hits', { id: text('id').primaryKey() });
        expect(() =>
            assertPluginTablePrefixes([
                def({ package: '@astromech/redirects', alias: 'myredirects', schema: { log } }),
            ])
        ).not.toThrow();
    });
});
