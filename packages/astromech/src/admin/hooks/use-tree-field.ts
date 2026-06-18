/* eslint-disable @typescript-eslint/no-non-null-assertion -- idiomatic non-null assertions in tree-field traversal */
/**
 * useTreeField — state management for the tree field component.
 *
 * Internally flattens the recursive tree into an ordered list of `FlatNode`s
 * (each carrying its depth and parentId). All mutations operate on the flat
 * list and rebuild the tree before committing.
 */

export type TreeNode = {
    _id: string;
    _disabled?: boolean;
    _children?: TreeNode[];
    [key: string]: unknown;
};

export type FlatNode = {
    node: TreeNode;
    depth: number;
    parentId: string | null;
};

// ============================================================================
// Tree ↔ flat-list conversion
// ============================================================================

export function flattenTree(
    nodes: TreeNode[],
    depth = 0,
    parentId: string | null = null
): FlatNode[] {
    const result: FlatNode[] = [];
    for (const node of nodes) {
        result.push({ node, depth, parentId });
        if (Array.isArray(node._children) && node._children.length > 0) {
            result.push(...flattenTree(node._children, depth + 1, node._id));
        }
    }
    return result;
}

export function buildTree(flat: FlatNode[]): TreeNode[] {
    // Reconstruct a tree from the flat list. Each node's _children are the
    // immediately following nodes at depth+1 that trace back to it.
    // Strategy: walk the flat list and assign children by parent tracking.
    const nodeMap = new Map<string, TreeNode>();

    // Clone nodes without _children first.
    for (const { node } of flat) {
        const { _children: _dropped, ...rest } = node;
        void _dropped;
        nodeMap.set(node._id, rest as TreeNode);
    }

    const roots: TreeNode[] = [];

    for (const { node, parentId } of flat) {
        const cloned = nodeMap.get(node._id)!;
        if (parentId === null) {
            roots.push(cloned);
        } else {
            const parent = nodeMap.get(parentId)!;
            if (!Array.isArray(parent._children)) {
                parent._children = [];
            }
            (parent._children as TreeNode[]).push(cloned);
        }
    }

    return roots;
}

// ============================================================================
// Node helpers
// ============================================================================

function withId(data: Partial<TreeNode> = {}): TreeNode {
    return {
        ...data,
        _id: typeof data._id === 'string' ? data._id : crypto.randomUUID(),
    };
}

function deepCloneNode(node: TreeNode): TreeNode {
    const cloned: TreeNode = { ...node, _id: crypto.randomUUID() };
    if (Array.isArray(node._children)) {
        cloned._children = node._children.map(deepCloneNode);
    } else {
        delete cloned._children;
    }
    return cloned;
}

// ============================================================================
// Hook
// ============================================================================

import { useState, useCallback } from 'react';

type UseTreeFieldOptions = {
    name: string;
    value: unknown;
    onChange: (name: string, value: unknown) => void;
    maxDepth?: number | undefined;
};

export function useTreeField({ name, value, onChange, maxDepth }: UseTreeFieldOptions) {
    const rawArray = Array.isArray(value) ? (value as TreeNode[]) : [];

    const [nodes, setNodes] = useState<TreeNode[]>(() =>
        rawArray.map((n) => withId(n as Partial<TreeNode>))
    );

    const flat = flattenTree(nodes);

    const commit = useCallback(
        (next: TreeNode[]) => {
            setNodes(next);
            onChange(name, next);
        },
        [name, onChange]
    );

    // Add a root-level node.
    const addRoot = useCallback(() => {
        commit([...nodes, withId()]);
    }, [nodes, commit]);

    // Add a child to the node with the given id.
    const addChild = useCallback(
        (parentId: string) => {
            const parentFlat = flat.find((f) => f.node._id === parentId);
            if (parentFlat === undefined) return;
            if (maxDepth !== undefined && parentFlat.depth + 1 >= maxDepth) return;

            const addChildToNode = (ns: TreeNode[]): TreeNode[] =>
                ns.map((n) => {
                    if (n._id === parentId) {
                        return {
                            ...n,
                            _children: [...(n._children ?? []), withId()],
                        };
                    }
                    if (Array.isArray(n._children)) {
                        return { ...n, _children: addChildToNode(n._children) };
                    }
                    return n;
                });

            commit(addChildToNode(nodes));
        },
        [nodes, flat, commit, maxDepth]
    );

    // Remove node by id (including its subtree).
    const removeNode = useCallback(
        (id: string) => {
            const removeFromList = (ns: TreeNode[]): TreeNode[] =>
                ns
                    .filter((n) => n._id !== id)
                    .map((n) =>
                        Array.isArray(n._children)
                            ? { ...n, _children: removeFromList(n._children) }
                            : n
                    );
            commit(removeFromList(nodes));
        },
        [nodes, commit]
    );

    // Duplicate node (deep clone with new ids) immediately after the original.
    const duplicateNode = useCallback(
        (id: string) => {
            const duplicateInList = (ns: TreeNode[]): TreeNode[] => {
                const result: TreeNode[] = [];
                for (const n of ns) {
                    result.push(
                        Array.isArray(n._children)
                            ? { ...n, _children: duplicateInList(n._children) }
                            : n
                    );
                    if (n._id === id) {
                        result.push(deepCloneNode(n));
                    }
                }
                return result;
            };
            commit(duplicateInList(nodes));
        },
        [nodes, commit]
    );

    // Toggle disabled on a single node (not its children).
    const toggleDisabled = useCallback(
        (id: string) => {
            const toggleInList = (ns: TreeNode[]): TreeNode[] =>
                ns.map((n) => {
                    const updated: TreeNode =
                        n._id === id
                            ? n._disabled === true
                                ? (() => {
                                      const { _disabled: _removed, ...rest } = n;
                                      return rest as TreeNode;
                                  })()
                                : { ...n, _disabled: true }
                            : n;
                    if (Array.isArray(updated._children)) {
                        return { ...updated, _children: toggleInList(updated._children) };
                    }
                    return updated;
                });
            commit(toggleInList(nodes));
        },
        [nodes, commit]
    );

    // Update a field value on a node.
    const updateNodeField = useCallback(
        (id: string, fieldName: string, fieldValue: unknown) => {
            const updateInList = (ns: TreeNode[]): TreeNode[] =>
                ns.map((n) => {
                    if (n._id === id) {
                        return { ...n, [fieldName]: fieldValue };
                    }
                    if (Array.isArray(n._children)) {
                        return { ...n, _children: updateInList(n._children) };
                    }
                    return n;
                });
            commit(updateInList(nodes));
        },
        [nodes, commit]
    );

    // Reorder two nodes at the same level (drag within a list).
    const reorderNodes = useCallback(
        (activeId: string, overId: string) => {
            if (activeId === overId) return;
            const reorderInList = (ns: TreeNode[]): TreeNode[] => {
                const oldIndex = ns.findIndex((n) => n._id === activeId);
                if (oldIndex !== -1) {
                    const newIndex = ns.findIndex((n) => n._id === overId);
                    if (newIndex === -1) return ns;
                    const next = [...ns];
                    const [moved] = next.splice(oldIndex, 1);
                    if (moved !== undefined) {
                        next.splice(newIndex, 0, moved);
                    }
                    return next;
                }
                return ns.map((n) =>
                    Array.isArray(n._children)
                        ? { ...n, _children: reorderInList(n._children) }
                        : n
                );
            };
            commit(reorderInList(nodes));
        },
        [nodes, commit]
    );

    // Indent a node (make it a child of its preceding sibling).
    const indentNode = useCallback(
        (id: string) => {
            const indentInList = (ns: TreeNode[]): TreeNode[] | null => {
                const idx = ns.findIndex((n) => n._id === id);
                if (idx > 0) {
                    // Found at this level — move under previous sibling.
                    const prev = ns[idx - 1]!;
                    const target = ns[idx]!;
                    const prevDepth =
                        flat.find((f) => f.node._id === prev._id)?.depth ?? 0;
                    if (maxDepth !== undefined && prevDepth + 1 >= maxDepth) return null;
                    const next = [...ns];
                    next.splice(idx, 1);
                    next[idx - 1] = {
                        ...prev,
                        _children: [...(prev._children ?? []), target],
                    };
                    return next;
                }
                // Recurse into children.
                for (let i = 0; i < ns.length; i++) {
                    const n = ns[i]!;
                    if (Array.isArray(n._children)) {
                        const result = indentInList(n._children);
                        if (result !== null) {
                            const updated = [...ns];
                            updated[i] = { ...n, _children: result };
                            return updated;
                        }
                    }
                }
                return null;
            };
            const result = indentInList(nodes);
            if (result !== null) commit(result);
        },
        [nodes, flat, commit, maxDepth]
    );

    // Outdent a node (move it up to its parent's level, after the parent).
    const outdentNode = useCallback(
        (id: string) => {
            const outdentInList = (
                ns: TreeNode[],
                parent: TreeNode | null
            ): { list: TreeNode[]; extracted: TreeNode | null } => {
                const idx = ns.findIndex((n) => n._id === id);
                if (idx !== -1 && parent !== null) {
                    // Found at this level and has a parent — extract it.
                    const target = ns[idx]!;
                    const next = ns.filter((_, i) => i !== idx);
                    return { list: next, extracted: target };
                }
                for (let i = 0; i < ns.length; i++) {
                    const n = ns[i]!;
                    if (Array.isArray(n._children)) {
                        const { list: newChildren, extracted } = outdentInList(
                            n._children,
                            n
                        );
                        if (extracted !== null) {
                            const updated = [...ns];
                            updated[i] = { ...n, _children: newChildren };
                            // Insert extracted after updated[i] in ns.
                            updated.splice(i + 1, 0, extracted);
                            return { list: updated, extracted: null }; // null = already placed
                        }
                    }
                }
                return { list: ns, extracted: null };
            };
            const { list } = outdentInList(nodes, null);
            commit(list);
        },
        [nodes, commit]
    );

    return {
        nodes,
        flat,
        addRoot,
        addChild,
        removeNode,
        duplicateNode,
        toggleDisabled,
        updateNodeField,
        reorderNodes,
        indentNode,
        outdentNode,
    };
}
