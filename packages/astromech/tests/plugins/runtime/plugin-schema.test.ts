import { describe, expect, it } from 'vitest';
import type { PluginDefinition } from '@/types/index.js';
import { defineTable, type TableDescriptor } from '@/database/define-table.js';
import {
    assertPluginTablePrefixes,
    collectPluginSchemas,
} from '@/plugins/runtime/plugin-schema.js';

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

describe('collectPluginSchemas', () => {
    it('flattens tables and tags them with the plugin alias', () => {
        const collected = collectPluginSchemas([
            def({
                package: '@astromech/analytics',
                schema: [table('plugin_analytics_events')],
            }),
        ]);
        expect(collected).toHaveLength(1);
        expect(collected[0]).toMatchObject({
            alias: 'analytics',
            tableName: 'plugin_analytics_events',
        });
    });

    it('ignores non-descriptor entries', () => {
        const collected = collectPluginSchemas([
            def({
                package: '@astromech/x',
                schema: [{ foo: 'bar' } as unknown as TableDescriptor],
            }),
        ]);
        expect(collected).toEqual([]);
    });
});

describe('assertPluginTablePrefixes', () => {
    it('passes when tables use the plugin_{alias}_ prefix', () => {
        expect(() =>
            assertPluginTablePrefixes([
                def({ package: '@astromech/audit', schema: [table('plugin_audit_log')] }),
            ])
        ).not.toThrow();
    });

    it('throws when a table is missing the prefix', () => {
        expect(() =>
            assertPluginTablePrefixes([
                def({ package: '@astromech/audit', schema: [table('audit_log')] }),
            ])
        ).toThrow(/plugin_audit_/);
    });

    it('uses the alias, not the package, for the prefix', () => {
        expect(() =>
            assertPluginTablePrefixes([
                def({
                    package: '@astromech/redirects',
                    alias: 'myredirects',
                    schema: [table('plugin_myredirects_hits')],
                }),
            ])
        ).not.toThrow();
    });
});
