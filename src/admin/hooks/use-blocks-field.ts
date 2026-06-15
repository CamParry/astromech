import { useState, useCallback } from 'react';

export type BlockWithId = {
    _id: string;
    _type: string;
    _disabled?: boolean;
    _title?: string;
    [fieldName: string]: unknown;
};

export type SerializedBlock = {
    _type: string;
    _disabled?: boolean;
    _title?: string;
    _id?: string;
    [fieldName: string]: unknown;
};

function attachId(block: SerializedBlock): BlockWithId {
    return {
        ...block,
        _id: typeof block._id === 'string' ? block._id : crypto.randomUUID(),
    };
}

type UseBlocksFieldOptions = {
    name: string;
    value: unknown;
    onChange: (name: string, value: unknown) => void;
};

export function useBlocksField({ name, value, onChange }: UseBlocksFieldOptions) {
    const rawArray = Array.isArray(value) ? (value as SerializedBlock[]) : [];

    const [blocks, setBlocks] = useState<BlockWithId[]>(() => rawArray.map(attachId));

    // `_id` is a persisted UUID (stable item identity for diffs/versioning), so
    // blocks commit as-is — no key stripping.
    const commit = useCallback(
        (next: BlockWithId[]) => {
            setBlocks(next);
            onChange(name, next);
        },
        [name, onChange]
    );

    const addBlock = useCallback(
        (type: string) => {
            commit([...blocks, attachId({ _type: type })]);
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

    // Re-enabling omits `_disabled` entirely (default-by-absence) rather than
    // storing `_disabled: false`, keeping payloads clean.
    const toggleDisabled = useCallback(
        (id: string) => {
            commit(
                blocks.map((b) => {
                    if (b._id !== id) return b;
                    if (b._disabled === true) {
                        const { _disabled: _removed, ...rest } = b;
                        return rest as BlockWithId;
                    }
                    return { ...b, _disabled: true };
                })
            );
        },
        [blocks, commit]
    );

    // Empty/blank title omits `_title` (default-by-absence) rather than storing
    // an empty string, keeping payloads clean.
    const renameBlock = useCallback(
        (id: string, title: string | undefined) => {
            commit(
                blocks.map((b) => {
                    if (b._id !== id) return b;
                    if (title === undefined || title === '') {
                        const { _title: _removed, ...rest } = b;
                        return rest as BlockWithId;
                    }
                    return { ...b, _title: title };
                })
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

    return { blocks, addBlock, removeBlock, duplicateBlock, toggleDisabled, renameBlock, updateBlock, reorder };
}
