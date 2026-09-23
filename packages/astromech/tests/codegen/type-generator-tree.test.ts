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
        expect(output).toContain('export type PagesNavItemsTreeNode');
        // Self-referential _children property.
        expect(output).toContain('_children?: PagesNavItemsTreeNode[]');
        // Field typed as array of the named node.
        expect(output).toContain('navItems?: PagesNavItemsTreeNode[]');
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

        const nodePos = output.indexOf('export type PagesMenuItemsTreeNode');
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
        expect(output).toContain('items: PagesItemsTreeNode[]');
        expect(output).not.toContain('items?: PagesItemsTreeNode[]');
    });
});

describe('type-generator — hoisted names', () => {
    const menu = {
        name: 'menu',
        type: 'tree',
        fields: [{ name: 'label', type: 'text' }],
    };

    it('gives two entry types with the same tree field distinct node types', () => {
        const config = {
            ...makeConfig([menu]),
            entries: {
                header: { fields: { main: [menu], sidebar: [] } },
                footer: { fields: { main: [menu], sidebar: [] } },
            },
        } as unknown as ResolvedConfig;

        const output = generateClientTypes(config);

        expect(output).toContain('export type HeaderMenuTreeNode = {');
        expect(output).toContain('export type FooterMenuTreeNode = {');
        expect(output.match(/export type \w*MenuTreeNode = /g)).toHaveLength(2);
    });

    it('numbers a second tree of the same name inside one entry type', () => {
        const config = makeConfig([
            { name: 'top', type: 'group', fields: [menu] },
            { name: 'bottom', type: 'group', fields: [menu] },
        ]);

        const output = generateClientTypes(config);

        expect(output).toContain('menu?: PagesMenuTreeNode[];');
        expect(output).toContain('menu?: PagesMenuTreeNode2[];');
    });

    it('quotes an entry-type key that is not an identifier', () => {
        const config = {
            ...makeConfig([]),
            entries: { 'case-study': { fields: { main: [], sidebar: [] } } },
        } as unknown as ResolvedConfig;

        expect(generateClientTypes(config)).toContain(
            '"case-study": { fields: CaseStudyFields;'
        );
    });
});

describe('type-generator — relation targets', () => {
    it('types users, media and unknown targets on the Relations type', () => {
        const output = generateClientTypes(
            makeConfig([
                { name: 'author', type: 'relationship', target: 'users' },
                { name: 'cover', type: 'relationship', target: 'media' },
                {
                    name: 'other',
                    type: 'relationship',
                    target: 'nowhere',
                    multiple: true,
                },
            ])
        );

        expect(output).toContain("author: import('astromech').User;");
        expect(output).toContain("cover: import('astromech').Media;");
        expect(output).toContain("other: import('astromech').Entry[];");
    });
});
