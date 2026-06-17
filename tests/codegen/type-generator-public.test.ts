import { describe, expect, it } from 'vitest';
import { generateSdkTypes } from '@/codegen/type-generator.js';
import type { ResolvedConfig } from '@/types/index.js';

function makeConfig(mainFields: object[], sidebarFields: object[] = []): ResolvedConfig {
    return {
        entries: {
            posts: {
                fields: {
                    main: mainFields as never,
                    sidebar: sidebarFields as never,
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

describe('type-generator — FieldsPublic variant', () => {
    it('emits a FieldsPublic interface alongside Fields for every collection', () => {
        const config = makeConfig([{ name: 'title', type: 'text' }]);
        const output = generateSdkTypes(config);

        expect(output).toContain('export interface PostsFields {');
        expect(output).toContain('export interface PostsFieldsPublic {');
    });

    it('adds fieldsPublic to the AstromechEntryTypes map entry', () => {
        const config = makeConfig([{ name: 'title', type: 'text' }]);
        const output = generateSdkTypes(config);

        expect(output).toContain(
            'posts: { fields: PostsFields; fieldsPublic: PostsFieldsPublic; relations: PostsRelations };'
        );
    });

    it('FieldsPublic carries the __shape brand marker', () => {
        const config = makeConfig([{ name: 'title', type: 'text' }]);
        const output = generateSdkTypes(config);

        // The brand must appear inside the PostsFieldsPublic interface.
        const publicIdx = output.indexOf('export interface PostsFieldsPublic {');
        expect(publicIdx).toBeGreaterThan(-1);
        const snippet = output.slice(publicIdx, publicIdx + 200);
        expect(snippet).toContain("readonly __shape?: 'public';");
    });

    it('FieldsPublic omits a field marked private: true', () => {
        const config = makeConfig([
            { name: 'title', type: 'text' },
            { name: 'internalScore', type: 'number', private: true },
        ]);
        const output = generateSdkTypes(config);

        // Full type includes it.
        const fullIdx = output.indexOf('export interface PostsFields {');
        const fullEnd = output.indexOf('\n}', fullIdx);
        const fullSlice = output.slice(fullIdx, fullEnd);
        expect(fullSlice).toContain('internalScore');

        // Public type omits it.
        const pubIdx = output.indexOf('export interface PostsFieldsPublic {');
        const pubEnd = output.indexOf('\n}', pubIdx);
        const pubSlice = output.slice(pubIdx, pubEnd);
        expect(pubSlice).not.toContain('internalScore');
        // But non-private field is still present.
        expect(pubSlice).toContain('title');
    });

    it('FieldsPublic still includes non-private fields', () => {
        const config = makeConfig([
            { name: 'body', type: 'richtext' },
            { name: 'secret', type: 'text', private: true },
        ]);
        const output = generateSdkTypes(config);

        const pubIdx = output.indexOf('export interface PostsFieldsPublic {');
        const pubEnd = output.indexOf('\n}', pubIdx);
        const pubSlice = output.slice(pubIdx, pubEnd);
        expect(pubSlice).toContain('body');
    });

    it('FieldsPublic omits _disabled and _title from repeater element type', () => {
        const config = makeConfig([
            {
                name: 'items',
                type: 'repeater',
                fields: [{ name: 'label', type: 'text' }],
            },
        ]);
        const output = generateSdkTypes(config);

        // Full type includes _disabled and _title.
        const fullIdx = output.indexOf('export interface PostsFields {');
        const fullEnd = output.indexOf('\nexport interface PostsFieldsPublic', fullIdx);
        const fullSlice = output.slice(fullIdx, fullEnd);
        expect(fullSlice).toContain('_disabled?: boolean;');
        expect(fullSlice).toContain('_title?: string;');

        // Public type omits them.
        const pubIdx = output.indexOf('export interface PostsFieldsPublic {');
        const pubEnd = output.indexOf('\nexport type PostsRelations', pubIdx);
        const pubSlice = output.slice(pubIdx, pubEnd);
        expect(pubSlice).not.toContain('_disabled');
        expect(pubSlice).not.toContain('_title');
        // But keeps _id.
        expect(pubSlice).toContain('_id: string;');
    });

    it('FieldsPublic omits _disabled from tree node type but keeps _id and _children', () => {
        const config = makeConfig([
            {
                name: 'navItems',
                type: 'tree',
                fields: [{ name: 'label', type: 'text' }],
            },
        ]);
        const output = generateSdkTypes(config);

        // Public tree node interface is emitted with a distinct name.
        expect(output).toContain('export interface NavItemsPublicTreeNode {');
        const nodeIdx = output.indexOf('export interface NavItemsPublicTreeNode {');
        const nodeEnd = output.indexOf('\n}', nodeIdx);
        const nodeSlice = output.slice(nodeIdx, nodeEnd);
        expect(nodeSlice).toContain('_id: string;');
        expect(nodeSlice).not.toContain('_disabled');
        expect(nodeSlice).toContain('_children?: NavItemsPublicTreeNode[];');
        expect(nodeSlice).toContain('label');

        // Public field references the public node type.
        const pubIdx = output.indexOf('export interface PostsFieldsPublic {');
        const pubEnd = output.indexOf('\nexport type PostsRelations', pubIdx);
        const pubSlice = output.slice(pubIdx, pubEnd);
        expect(pubSlice).toContain('navItems?: NavItemsPublicTreeNode[]');
    });

    it('FieldsPublic omits _disabled and _title from blocks field', () => {
        const config = makeConfig([{ name: 'content', type: 'blocks' }]);
        const output = generateSdkTypes(config);

        const pubIdx = output.indexOf('export interface PostsFieldsPublic {');
        const pubEnd = output.indexOf('\nexport type PostsRelations', pubIdx);
        const pubSlice = output.slice(pubIdx, pubEnd);

        expect(pubSlice).toContain('_id: string');
        expect(pubSlice).toContain('_type: string');
        expect(pubSlice).not.toContain('_disabled');
        expect(pubSlice).not.toContain('_title');
    });

    it('FieldsPublic still emits even when no private fields exist (alias pattern)', () => {
        const config = makeConfig([{ name: 'title', type: 'text' }]);
        const output = generateSdkTypes(config);

        // Both interfaces exist.
        expect(output).toContain('export interface PostsFields {');
        expect(output).toContain('export interface PostsFieldsPublic {');
    });

    it('FieldsPublic omits private fields inside a group', () => {
        const config = makeConfig([
            {
                name: 'meta',
                type: 'group',
                fields: [
                    { name: 'title', type: 'text' },
                    { name: 'internal', type: 'text', private: true },
                ],
            },
        ]);
        const output = generateSdkTypes(config);

        const pubIdx = output.indexOf('export interface PostsFieldsPublic {');
        const pubEnd = output.indexOf('\nexport type PostsRelations', pubIdx);
        const pubSlice = output.slice(pubIdx, pubEnd);
        expect(pubSlice).toContain('title');
        expect(pubSlice).not.toContain('internal');
    });

    it('full Fields type does NOT carry the __shape brand', () => {
        const config = makeConfig([{ name: 'title', type: 'text' }]);
        const output = generateSdkTypes(config);

        const fullIdx = output.indexOf('export interface PostsFields {');
        const fullEnd = output.indexOf('\nexport interface PostsFieldsPublic', fullIdx);
        const fullSlice = output.slice(fullIdx, fullEnd);
        expect(fullSlice).not.toContain('__shape');
    });
});

describe('type-generator — public relations reference FieldsPublic', () => {
    it('full relations reference Fields; public should use FieldsPublic for related collections', () => {
        // The Relations type is shared (used for populate overloads referencing either shape).
        // The Relations type itself references full Fields as before.
        // The public shape's relations are composed at the TypedEntriesApi overload level.
        // Here we just verify the Relations type still references the full Fields.
        const config = {
            entries: {
                posts: {
                    fields: {
                        main: [
                            {
                                name: 'category',
                                type: 'relationship',
                                target: 'categories',
                            },
                        ],
                        sidebar: [],
                    },
                },
                categories: {
                    fields: { main: [{ name: 'name', type: 'text' }], sidebar: [] },
                },
            },
            globals: {},
            pages: {},
            locales: [],
            defaultLocale: 'en',
            pluginEntries: {},
        } as unknown as ResolvedConfig;

        const output = generateSdkTypes(config);

        // Relations type uses full Fields (unchanged from original behaviour).
        expect(output).toContain(
            "import('astromech').TypedEntry<CategoriesFields>"
        );
        // Both collection public interfaces exist.
        expect(output).toContain('export interface PostsFieldsPublic {');
        expect(output).toContain('export interface CategoriesFieldsPublic {');
    });
});
