import { describe, expect, it } from 'vitest';
import { flattenTree, buildTree } from '@/admin/hooks/use-tree-field.js';
import type { TreeNode } from '@/admin/hooks/use-tree-field.js';

// ============================================================================
// flattenTree
// ============================================================================

describe('flattenTree', () => {
    it('flattens a single root node', () => {
        const nodes: TreeNode[] = [{ _id: 'a', label: 'A' }];
        const flat = flattenTree(nodes);
        expect(flat).toHaveLength(1);
        expect(flat[0]!.node._id).toBe('a');
        expect(flat[0]!.depth).toBe(0);
        expect(flat[0]!.parentId).toBeNull();
    });

    it('flattens nested children in order (parent before children)', () => {
        const nodes: TreeNode[] = [
            {
                _id: 'a',
                label: 'A',
                _children: [{ _id: 'b', label: 'B' }],
            },
        ];
        const flat = flattenTree(nodes);
        expect(flat).toHaveLength(2);
        expect(flat[0]!.node._id).toBe('a');
        expect(flat[0]!.depth).toBe(0);
        expect(flat[1]!.node._id).toBe('b');
        expect(flat[1]!.depth).toBe(1);
        expect(flat[1]!.parentId).toBe('a');
    });

    it('handles multiple roots and deep nesting', () => {
        const nodes: TreeNode[] = [
            { _id: 'a', _children: [{ _id: 'b', _children: [{ _id: 'c' }] }] },
            { _id: 'd' },
        ];
        const flat = flattenTree(nodes);
        expect(flat.map((f) => f.node._id)).toEqual(['a', 'b', 'c', 'd']);
        expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 0]);
        expect(flat.map((f) => f.parentId)).toEqual([null, 'a', 'b', null]);
    });
});

// ============================================================================
// buildTree
// ============================================================================

describe('buildTree', () => {
    it('rebuilds a single root node', () => {
        const flat = [{ node: { _id: 'a', label: 'Foo' }, depth: 0, parentId: null }];
        const tree = buildTree(flat);
        expect(tree).toHaveLength(1);
        expect(tree[0]!._id).toBe('a');
        expect(tree[0]!.label).toBe('Foo');
    });

    it('reconstructs parent–child nesting', () => {
        const flat = [
            { node: { _id: 'a' }, depth: 0, parentId: null },
            { node: { _id: 'b' }, depth: 1, parentId: 'a' },
        ];
        const tree = buildTree(flat);
        expect(tree).toHaveLength(1);
        expect(tree[0]!._children).toHaveLength(1);
        expect(tree[0]!._children![0]!._id).toBe('b');
    });

    it('round-trips flatten → buildTree without data loss', () => {
        const original: TreeNode[] = [
            {
                _id: 'x',
                label: 'X',
                _children: [{ _id: 'y', label: 'Y' }],
            },
            { _id: 'z', label: 'Z' },
        ];
        const rebuilt = buildTree(flattenTree(original));
        expect(rebuilt).toHaveLength(2);
        expect(rebuilt[0]!._id).toBe('x');
        expect(rebuilt[0]!.label).toBe('X');
        expect(rebuilt[0]!._children).toHaveLength(1);
        expect(rebuilt[0]!._children![0]!._id).toBe('y');
        expect(rebuilt[1]!._id).toBe('z');
    });

    it('nodes with no children have no _children property in the rebuild', () => {
        const flat = [
            { node: { _id: 'a' }, depth: 0, parentId: null },
            { node: { _id: 'b' }, depth: 0, parentId: null },
        ];
        const tree = buildTree(flat);
        expect('_children' in tree[0]!).toBe(false);
        expect('_children' in tree[1]!).toBe(false);
    });
});

// ============================================================================
// Mutation helpers (pure utility — exercise via direct array manipulation)
// ============================================================================

describe('_id stability', () => {
    it('_id values survive a flatten → buildTree round-trip', () => {
        const nodes: TreeNode[] = [
            { _id: 'stable-1', title: 'A', _children: [{ _id: 'stable-2', title: 'B' }] },
        ];
        const rebuilt = buildTree(flattenTree(nodes));
        expect(rebuilt[0]!._id).toBe('stable-1');
        expect(rebuilt[0]!._children![0]!._id).toBe('stable-2');
    });
});

describe('_disabled reserved key', () => {
    it('_disabled travels through flatten → buildTree untouched', () => {
        const nodes: TreeNode[] = [{ _id: 'a', _disabled: true }];
        const rebuilt = buildTree(flattenTree(nodes));
        expect(rebuilt[0]!._disabled).toBe(true);
    });
});

describe('_children reserved key', () => {
    it('empty _children array is treated as leaf', () => {
        const nodes: TreeNode[] = [{ _id: 'a', _children: [] }];
        const flat = flattenTree(nodes);
        expect(flat).toHaveLength(1); // no children emitted
    });
});
