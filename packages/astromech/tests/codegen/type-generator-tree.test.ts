import type { ResolvedConfig } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { generateClientTypes } from '@/codegen/type-generator';

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
    it('emits a named self-referential node type', () => {
        const config = makeConfig([
            {
                name: 'navItems',
                type: 'tree',
                fields: [{ name: 'label', type: 'text' }],
            },
        ]);

        const output = generateClientTypes(config);

        // Named node type must appear.
        expect(output).toContain('export type NavItemsTreeNode');
        // Self-referential _children property.
        expect(output).toContain('_children?: NavItemsTreeNode[]');
        // Field typed as array of the named node.
        expect(output).toContain('navItems?: NavItemsTreeNode[]');
    });

    it('includes reserved _id and _disabled in the node type', () => {
        const config = makeConfig([
            {
                name: 'items',
                type: 'tree',
                fields: [{ name: 'title', type: 'text' }],
            },
        ]);

        const output = generateClientTypes(config);

        expect(output).toContain('_id: string;');
        expect(output).toContain('_disabled?: boolean;');
    });

    it('includes child field types in the node type', () => {
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

        const output = generateClientTypes(config);

        expect(output).toContain('label?: string;');
        expect(output).toContain('count?: number;');
    });

    it('node type appears before the collection Fields type (hoisted)', () => {
        const config = makeConfig([
            {
                name: 'menuItems',
                type: 'tree',
                fields: [{ name: 'label', type: 'text' }],
            },
        ]);

        const output = generateClientTypes(config);

        const nodePos = output.indexOf('export type MenuItemsTreeNode');
        const fieldsPos = output.indexOf('export type PagesFields');
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

        const output = generateClientTypes(config);

        // Required field — no optional marker.
        expect(output).toContain('items: ItemsTreeNode[]');
        expect(output).not.toContain('items?: ItemsTreeNode[]');
    });
});
