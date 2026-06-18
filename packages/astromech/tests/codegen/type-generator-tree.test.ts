import { describe, expect, it } from 'vitest';
import { generateSdkTypes } from '@/codegen/type-generator.js';
import type { ResolvedConfig } from '@/types/index.js';

function makeConfig(fields: object[]): ResolvedConfig {
    return {
        entries: {
            pages: {
                fields: {
                    main: fields as never,
                    sidebar: [],
                },
            },
        },
        globals: {},
        pages: {},
        locales: [],
        defaultLocale: 'en',
        pluginEntries: {},
    } as unknown as ResolvedConfig;
}

describe('type-generator — tree field', () => {
    it('emits a named self-referential node interface', () => {
        const config = makeConfig([
            {
                name: 'navItems',
                type: 'tree',
                fields: [{ name: 'label', type: 'text' }],
            },
        ]);

        const output = generateSdkTypes(config);

        // Named node interface must appear.
        expect(output).toContain('export interface NavItemsTreeNode');
        // Self-referential _children property.
        expect(output).toContain('_children?: NavItemsTreeNode[]');
        // Field typed as array of the named node.
        expect(output).toContain('navItems?: NavItemsTreeNode[]');
    });

    it('includes reserved _id and _disabled in the node interface', () => {
        const config = makeConfig([
            {
                name: 'items',
                type: 'tree',
                fields: [{ name: 'title', type: 'text' }],
            },
        ]);

        const output = generateSdkTypes(config);

        expect(output).toContain('_id: string;');
        expect(output).toContain('_disabled?: boolean;');
    });

    it('includes child field types in the node interface', () => {
        const config = makeConfig([
            {
                name: 'items',
                type: 'tree',
                fields: [
                    { name: 'label', type: 'text' },
                    { name: 'count', type: 'number' },
                ],
            },
        ]);

        const output = generateSdkTypes(config);

        expect(output).toContain('label?: string;');
        expect(output).toContain('count?: number;');
    });

    it('node interface appears before the collection Fields interface (hoisted)', () => {
        const config = makeConfig([
            {
                name: 'menuItems',
                type: 'tree',
                fields: [{ name: 'label', type: 'text' }],
            },
        ]);

        const output = generateSdkTypes(config);

        const nodePos = output.indexOf('export interface MenuItemsTreeNode');
        const fieldsPos = output.indexOf('export interface PagesFields');
        expect(nodePos).toBeGreaterThan(-1);
        expect(fieldsPos).toBeGreaterThan(-1);
        expect(nodePos).toBeLessThan(fieldsPos);
    });

    it('handles a required tree field (no ? on the field)', () => {
        const config = makeConfig([
            {
                name: 'items',
                type: 'tree',
                required: true,
                fields: [{ name: 'label', type: 'text' }],
            },
        ]);

        const output = generateSdkTypes(config);

        // Required field — no optional marker.
        expect(output).toContain('items: ItemsTreeNode[]');
        expect(output).not.toContain('items?: ItemsTreeNode[]');
    });
});
