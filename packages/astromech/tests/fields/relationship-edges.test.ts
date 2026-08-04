/**
 * Unit tests for the pure relationship traversals: `collectRelationshipEdges`
 * (schema + data → index rows) and `collectRelationshipSchemaPaths` (schema
 * alone → the query allow-list). No db, no config.
 */

import { describe, expect, it } from 'vitest';
import {
    collectRelationshipEdges,
    collectRelationshipSchemaPaths,
} from '@/fields/relationship-edges.js';
import type { Field } from '@/types/index.js';

describe('collectRelationshipEdges — top-level fields', () => {
    it('yields one edge for a single relationship', () => {
        const defs: Field[] = [
            { name: 'author', type: 'relationship', target: 'people' },
        ];
        expect(collectRelationshipEdges(defs, { author: 'p1' })).toEqual([
            {
                schemaPath: 'author',
                instancePath: 'author',
                targetId: 'p1',
                targetKind: 'entry',
            },
        ]);
    });

    // The old subsystem only looked at `relationship`, so no media row was ever
    // written.
    it('treats a media field as a relation targeting media', () => {
        const defs: Field[] = [{ name: 'hero', type: 'media' }];
        expect(collectRelationshipEdges(defs, { hero: 'm1' })).toEqual([
            {
                schemaPath: 'hero',
                instancePath: 'hero',
                targetId: 'm1',
                targetKind: 'media',
            },
        ]);
    });

    it("maps target: 'users' to the user kind", () => {
        const defs: Field[] = [{ name: 'owner', type: 'relationship', target: 'users' }];
        expect(collectRelationshipEdges(defs, { owner: 'u1' })[0]?.targetKind).toBe(
            'user'
        );
    });

    it('yields one edge per id in a multi-relation', () => {
        const defs: Field[] = [
            { name: 'tags', type: 'relationship', target: 'tag', multiple: true },
        ];
        const edges = collectRelationshipEdges(defs, { tags: ['t1', 't2', 't3'] });
        expect(edges.map((e) => e.targetId)).toEqual(['t1', 't2', 't3']);
        expect(new Set(edges.map((e) => e.instancePath))).toEqual(new Set(['tags']));
    });

    it('collapses a duplicated id in one multi-relation to a single edge', () => {
        const defs: Field[] = [
            { name: 'tags', type: 'relationship', target: 'tag', multiple: true },
        ];
        const edges = collectRelationshipEdges(defs, { tags: ['t1', 't1'] });
        expect(edges).toHaveLength(1);
        expect(edges[0]?.targetId).toBe('t1');
    });

    it('yields nothing for a null, empty or non-string value', () => {
        const defs: Field[] = [
            { name: 'a', type: 'relationship', target: 'post' },
            { name: 'b', type: 'relationship', target: 'post' },
            { name: 'c', type: 'relationship', target: 'post' },
            { name: 'd', type: 'relationship', target: 'post', multiple: true },
        ];
        const edges = collectRelationshipEdges(defs, {
            a: null,
            b: '',
            c: 42,
            d: [],
        });
        expect(edges).toEqual([]);
    });

    it('yields nothing for a field with no value at all', () => {
        const defs: Field[] = [
            { name: 'author', type: 'relationship', target: 'people' },
        ];
        expect(collectRelationshipEdges(defs, {})).toEqual([]);
    });
});

describe('collectRelationshipEdges — nested containers', () => {
    it('walks into a group', () => {
        const defs: Field[] = [
            {
                name: 'seo',
                type: 'group',
                fields: [{ name: 'image', type: 'media' }],
            },
        ];
        expect(collectRelationshipEdges(defs, { seo: { image: 'm1' } })).toEqual([
            {
                schemaPath: 'seo.image',
                instancePath: 'seo.image',
                targetId: 'm1',
                targetKind: 'media',
            },
        ]);
    });

    it('addresses a repeater item by its persisted `_id`', () => {
        const defs: Field[] = [
            {
                name: 'items',
                type: 'repeater',
                fields: [{ name: 'author', type: 'relationship', target: 'people' }],
            },
        ];
        const edges = collectRelationshipEdges(defs, {
            items: [
                { _id: 'a1', author: 'p1' },
                { _id: 'b2', author: 'p2' },
            ],
        });
        expect(edges).toEqual([
            {
                schemaPath: 'items[].author',
                instancePath: 'items[a1].author',
                targetId: 'p1',
                targetKind: 'entry',
            },
            {
                schemaPath: 'items[].author',
                instancePath: 'items[b2].author',
                targetId: 'p2',
                targetKind: 'entry',
            },
        ]);
    });

    it('accumulates segments two containers deep', () => {
        const defs: Field[] = [
            {
                name: 'sections',
                type: 'repeater',
                fields: [
                    {
                        name: 'meta',
                        type: 'group',
                        fields: [
                            { name: 'author', type: 'relationship', target: 'people' },
                        ],
                    },
                ],
            },
        ];
        expect(
            collectRelationshipEdges(defs, {
                sections: [{ _id: 'a1', meta: { author: 'p1' } }],
            })
        ).toEqual([
            {
                schemaPath: 'sections[].meta.author',
                instancePath: 'sections[a1].meta.author',
                targetId: 'p1',
                targetKind: 'entry',
            },
        ]);
    });

    // Tree node ids are unique tree-wide, so depth never appears in a path.
    it('never renders `_children` as a path segment', () => {
        const defs: Field[] = [
            {
                name: 'nav',
                type: 'tree',
                fields: [{ name: 'page', type: 'relationship', target: 'page' }],
            },
        ];
        const edges = collectRelationshipEdges(defs, {
            nav: [
                {
                    _id: 'n1',
                    page: 'pg1',
                    _children: [{ _id: 'n2', page: 'pg2' }],
                },
            ],
        });
        // `tree` reports its scopes deepest-first, so compare unordered.
        expect([...edges].sort((a, b) => a.targetId.localeCompare(b.targetId))).toEqual([
            {
                schemaPath: 'nav[].page',
                instancePath: 'nav[n1].page',
                targetId: 'pg1',
                targetKind: 'entry',
            },
            {
                schemaPath: 'nav[].page',
                instancePath: 'nav[n2].page',
                targetId: 'pg2',
                targetKind: 'entry',
            },
        ]);
    });
});

describe('collectRelationshipEdges — determinism', () => {
    // `children()` mints a missing `_id`, so only stored (post-`processFields`)
    // data is safe to traverse. Stored data already carries its ids, which is
    // what makes a rebuild reproduce the same rows.
    it('produces identical instance paths on a second run over stored data', () => {
        const defs: Field[] = [
            {
                name: 'items',
                type: 'repeater',
                fields: [{ name: 'author', type: 'relationship', target: 'people' }],
            },
        ];
        const stored = {
            items: [
                { _id: 'a1', author: 'p1' },
                { _id: 'b2', author: 'p2' },
            ],
        };
        expect(collectRelationshipEdges(defs, stored)).toEqual(
            collectRelationshipEdges(defs, stored)
        );
    });
});

// ============================================================================
// collectRelationshipSchemaPaths — definitions only, no values
// ============================================================================

describe('collectRelationshipSchemaPaths', () => {
    it('returns an empty list for a schema declaring no relations', () => {
        const defs: Field[] = [
            { name: 'body', type: 'text' },
            { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual([]);
    });

    it('reports a flat relationship and a media field', () => {
        const defs: Field[] = [
            { name: 'author', type: 'relationship', target: 'people' },
            { name: 'hero', type: 'media' },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual(['author', 'hero']);
    });

    it('walks into a group', () => {
        const defs: Field[] = [
            {
                name: 'seo',
                type: 'group',
                fields: [{ name: 'image', type: 'media' }],
            },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual(['seo.image']);
    });

    it('collapses repeater items to the `[]` form', () => {
        const defs: Field[] = [
            {
                name: 'items',
                type: 'repeater',
                fields: [
                    { name: 'author', type: 'relationship', target: 'people' },
                    { name: 'gallery', type: 'media', multiple: true },
                ],
            },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual([
            'items[].author',
            'items[].gallery',
        ]);
    });

    it('walks into a tree', () => {
        const defs: Field[] = [
            {
                name: 'nav',
                type: 'tree',
                fields: [{ name: 'link', type: 'relationship', target: 'page' }],
            },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual(['nav[].link']);
    });

    // The probe carries one item per declared block type; without it `blocks`
    // yields no scope at all and every nested relation would go unreported.
    it('reports a path inside each declared block type', () => {
        const defs: Field[] = [
            {
                name: 'content',
                type: 'blocks',
                blocks: [
                    {
                        type: 'hero',
                        fields: [{ name: 'image', type: 'media' }],
                    },
                    {
                        type: 'quote',
                        fields: [
                            { name: 'source', type: 'relationship', target: 'people' },
                        ],
                    },
                ],
            },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual([
            'content[].image',
            'content[].source',
        ]);
    });

    it('de-duplicates a path two block types both declare', () => {
        const defs: Field[] = [
            {
                name: 'content',
                type: 'blocks',
                blocks: [
                    {
                        type: 'hero',
                        fields: [{ name: 'image', type: 'media' }],
                    },
                    {
                        type: 'banner',
                        fields: [{ name: 'image', type: 'media' }],
                    },
                ],
            },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual(['content[].image']);
    });

    it('accumulates segments through nested containers', () => {
        const defs: Field[] = [
            {
                name: 'sections',
                type: 'repeater',
                fields: [
                    {
                        name: 'meta',
                        type: 'group',
                        fields: [
                            { name: 'author', type: 'relationship', target: 'people' },
                        ],
                    },
                ],
            },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual(['sections[].meta.author']);
    });

    it('unwraps layout fields, which hold no data key', () => {
        const defs: Field[] = [
            {
                name: 'main',
                type: 'section',
                fields: [{ name: 'author', type: 'relationship', target: 'people' }],
            },
        ];
        expect(collectRelationshipSchemaPaths(defs)).toEqual(['author']);
    });
});
