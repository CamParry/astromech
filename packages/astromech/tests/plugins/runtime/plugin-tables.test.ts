import { describe, expect, it } from 'vitest';
import type { PluginDefinition } from '@/types/index.js';
import { defineTable, type TableDescriptor } from '@/database/define-table.js';
import {
    assertPluginTablePrefixes,
    collectPluginTables,
} from '@/plugins/runtime/plugin-tables.js';

const def = (
    partial: Partial<PluginDefinition> & { package: string }
): PluginDefinition => ({
    ...partial,
});

const table = (name: string): TableDescriptor =>
    defineTable(name, ({ col }) => ({
        id: col.id(),
        count: col.integer(),
    }));

describe('collectPluginTables', () => {
    it('flattens tables and tags them with the plugin alias', () => {
        const collected = collectPluginTables([
            def({
                package: '@astromech/analytics',
                tables: [table('plugin_analytics_events')],
            }),
        ]);
        expect(collected).toHaveLength(1);
        expect(collected[0]).toMatchObject({
            namespace: 'analytics',
            tableName: 'plugin_analytics_events',
        });
    });

    it('ignores non-descriptor entries', () => {
        const collected = collectPluginTables([
            def({
                package: '@astromech/x',
                tables: [{ foo: 'bar' } as unknown as TableDescriptor],
            }),
        ]);
        expect(collected).toEqual([]);
    });
});

describe('assertPluginTablePrefixes', () => {
    it('passes when tables use the plugin_{alias}_ prefix', () => {
        expect(() =>
            assertPluginTablePrefixes([
                def({ package: '@astromech/audit', tables: [table('plugin_audit_log')] }),
            ])
        ).not.toThrow();
    });

    it('throws when a table is missing the prefix', () => {
        expect(() =>
            assertPluginTablePrefixes([
                def({ package: '@astromech/audit', tables: [table('audit_log')] }),
            ])
        ).toThrow(/plugin_audit_/);
    });

    it('uses the derived namespace, not the raw package, for the prefix', () => {
        expect(() =>
            assertPluginTablePrefixes([
                def({
                    package: '@acme/redirects',
                    tables: [table('plugin_acme_redirects_hits')],
                }),
            ])
        ).not.toThrow();
    });
});
