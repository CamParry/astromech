import type { TreeNode } from '@/admin/hooks/use-tree-field';
import { describe, expect, it } from 'vitest';
import { flattenTree } from '@/admin/hooks/use-tree-field';

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

describe('_children reserved key', () => {
    it('empty _children array is treated as leaf', () => {
        const nodes: TreeNode[] = [{ _id: 'a', _children: [] }];
        const flat = flattenTree(nodes);
        expect(flat).toHaveLength(1); // no children emitted
    });
});
