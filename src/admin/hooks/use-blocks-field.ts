import { useState, useCallback } from 'react';

export type BlockWithId = {
    _id: string;
    type: string;
    disabled?: boolean;
    [fieldName: string]: unknown;
};

export type SerializedBlock = {
    type: string;
    disabled?: boolean;
    [fieldName: string]: unknown;
};

function attachId(block: SerializedBlock): BlockWithId {
    return {
        ...block,
        _id:
            typeof (block as Record<string, unknown>)['_id'] === 'string'
                ? ((block as Record<string, unknown>)['_id'] as string)
                : crypto.randomUUID(),
    };
}

function stripId(block: BlockWithId): SerializedBlock {
    const { _id: _ignored, ...rest } = block;
    return rest as SerializedBlock;
}

type UseBlocksFieldOptions = {
    name: string;
    value: unknown;
    onChange: (name: string, value: unknown) => void;
};

export function useBlocksField({ name, value, onChange }: UseBlocksFieldOptions) {
    const rawArray = Array.isArray(value) ? (value as SerializedBlock[]) : [];

    const [blocks, setBlocks] = useState<BlockWithId[]>(() => rawArray.map(attachId));

    const commit = useCallback(
        (next: BlockWithId[]) => {
            setBlocks(next);
            onChange(name, next.map(stripId));
        },
        [name, onChange]
    );

    const addBlock = useCallback(
        (type: string) => {
            commit([...blocks, attachId({ type })]);
        },
        [blocks, commit]
    );

    const removeBlock = useCallback(
        (id: string) => {
            commit(blocks.filter((b) => b._id !== id));
        },
        [blocks, commit]
    );

    const duplicateBlock = useCallback(
        (id: string) => {
            const idx = blocks.findIndex((b) => b._id === id);
            if (idx === -1) return;
            const source = blocks[idx]!;
            const clone: BlockWithId = { ...source, _id: crypto.randomUUID() };
            const next = [...blocks];
            next.splice(idx + 1, 0, clone);
            commit(next);
        },
        [blocks, commit]
    );

    const toggleDisabled = useCallback(
        (id: string) => {
            commit(
                blocks.map((b) =>
                    b._id === id ? { ...b, disabled: !b.disabled } : b
                )
            );
        },
        [blocks, commit]
    );

    const updateBlock = useCallback(
        (id: string, fieldName: string, fieldValue: unknown) => {
            commit(
                blocks.map((b) =>
                    b._id === id ? { ...b, [fieldName]: fieldValue } : b
                )
            );
        },
        [blocks, commit]
    );

    const reorder = useCallback(
        (oldIndex: number, newIndex: number) => {
            if (oldIndex === newIndex) return;
            const next = [...blocks];
            const [moved] = next.splice(oldIndex, 1);
            if (moved !== undefined) {
                next.splice(newIndex, 0, moved);
            }
            commit(next);
        },
        [blocks, commit]
    );

    return { blocks, addBlock, removeBlock, duplicateBlock, toggleDisabled, updateBlock, reorder };
}
