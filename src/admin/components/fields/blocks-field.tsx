import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent, Modifier } from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Collapsible } from '@base-ui/react';
import {
    GripVertical,
    ChevronUp,
    ChevronDown,
    Copy,
    Trash2,
    EyeOff,
    Eye,
    Plus,
} from 'lucide-react';
import type { BaseFieldProps, BlockDefinition, FieldDefinition } from '@/types/index.js';
import { FormField } from '@/admin/components/fields/form-field';
import { InlineTitle } from '@/admin/components/fields/inline-title';
import { useBlocksField } from '@/admin/hooks/use-blocks-field';
import { useLabel } from '@/admin/i18n/entry-namespace.js';
import type { BlockWithId } from '@/admin/hooks/use-blocks-field';
import './blocks-field.css';

// Lock dragging to the vertical axis — verticalListSortingStrategy only governs
// reordering, not the drag transform, so without this the block follows the
// cursor horizontally too.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
    ...transform,
    x: 0,
});

// ============================================================================
// useClickOutside
// ============================================================================

function useClickOutside(
    ref: React.RefObject<HTMLElement | null>,
    handler: () => void
): void {
    useEffect(() => {
        function listener(e: MouseEvent): void {
            if (ref.current === null || ref.current.contains(e.target as Node)) return;
            handler();
        }
        document.addEventListener('mousedown', listener);
        return () => document.removeEventListener('mousedown', listener);
    }, [ref, handler]);
}

// ============================================================================
// BlockPicker
// ============================================================================

type BlockPickerProps = {
    blocks: BlockDefinition[];
    onSelect: (type: string) => void;
    onClose: () => void;
};

function BlockPicker({
    blocks,
    onSelect,
    onClose,
}: BlockPickerProps): React.ReactElement {
    const { t } = useTranslation();
    const label = useLabel();
    return (
        <div
            className="am-blocks-picker"
            role="menu"
            aria-label={t('fields.blocksPickerLabel')}
        >
            {blocks.map((bd) => (
                <button
                    key={bd.type}
                    type="button"
                    role="menuitem"
                    className="am-blocks-picker-item"
                    onClick={() => {
                        onSelect(bd.type);
                        onClose();
                    }}
                >
                    <span className="am-blocks-picker-label">
                        {label(bd.label, bd.type)}
                    </span>
                </button>
            ))}
        </div>
    );
}

// ============================================================================
// SortableBlock
// ============================================================================

type SortableBlockProps = {
    block: BlockWithId;
    index: number;
    blockDef: BlockDefinition | undefined;
    name: string;
    disabled?: boolean;
    onRemove: (id: string) => void;
    onDuplicate: (id: string) => void;
    onToggleDisabled: (id: string) => void;
    onRename: (id: string, title: string | undefined) => void;
    onFieldChange: (id: string, fieldName: string, fieldValue: unknown) => void;
};

function SortableBlock({
    block,
    index,
    blockDef,
    name,
    disabled,
    onRemove,
    onDuplicate,
    onToggleDisabled,
    onRename,
    onFieldChange,
}: SortableBlockProps): React.ReactElement {
    const { t } = useTranslation();
    const resolveLabelText = useLabel();
    const [open, setOpen] = useState(true);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({
            id: block._id,
        });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
    };

    const blockLabel = blockDef
        ? resolveLabelText(blockDef.label, block._type)
        : block._type;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx('am-blocks-block', isDragging && 'am-blocks-block-dragging')}
        >
            <Collapsible.Root open={open} onOpenChange={setOpen}>
                <div
                    className={clsx(
                        'am-blocks-block-header',
                        block._disabled === true && 'am-blocks-block-header-soft-disabled'
                    )}
                >
                    {!disabled && (
                        <button
                            type="button"
                            className="am-blocks-drag-handle"
                            aria-label={t('fields.blocksDragHandle')}
                            {...attributes}
                            {...listeners}
                        >
                            <GripVertical size={16} />
                        </button>
                    )}

                    <div className="am-blocks-block-meta">
                        <InlineTitle
                            value={block._title}
                            fallback={blockLabel}
                            editLabel={t('fields.blocksRename')}
                            onCommit={(next) => onRename(block._id, next)}
                            {...(disabled !== undefined ? { disabled } : {})}
                        />
                        <span className="am-blocks-block-type-badge">{block._type}</span>
                        {block._disabled === true && (
                            <span className="am-blocks-block-disabled-badge">
                                {t('fields.blocksDisabledBadge')}
                            </span>
                        )}
                    </div>

                    <div className="am-blocks-block-controls">
                        {!disabled && (
                            <>
                                <button
                                    type="button"
                                    className="am-blocks-btn am-blocks-btn-icon"
                                    onClick={() => onToggleDisabled(block._id)}
                                    aria-label={
                                        block._disabled === true
                                            ? t('fields.blocksEnable')
                                            : t('fields.blocksDisable')
                                    }
                                    title={
                                        block._disabled === true
                                            ? t('fields.blocksEnable')
                                            : t('fields.blocksDisable')
                                    }
                                >
                                    {block._disabled === true ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="am-blocks-btn am-blocks-btn-icon"
                                    onClick={() => onDuplicate(block._id)}
                                    aria-label={t('fields.blocksDuplicate')}
                                    title={t('fields.blocksDuplicate')}
                                >
                                    <Copy size={16} />
                                </button>
                                <button
                                    type="button"
                                    className="am-blocks-btn am-blocks-btn-icon am-blocks-btn-remove"
                                    onClick={() => onRemove(block._id)}
                                    aria-label={t('fields.blocksRemove')}
                                    title={t('fields.blocksRemove')}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                        <Collapsible.Trigger
                            className="am-blocks-btn am-blocks-btn-icon"
                            aria-label={
                                open
                                    ? t('fields.blocksCollapse')
                                    : t('fields.blocksExpand')
                            }
                        >
                            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </Collapsible.Trigger>
                    </div>
                </div>

                <Collapsible.Panel className="am-blocks-block-panel">
                    <div
                        className={clsx(
                            'am-blocks-block-content',
                            block._disabled === true && 'am-blocks-block-content-disabled'
                        )}
                    >
                        {(blockDef?.fields ?? []).map((subField: FieldDefinition) => (
                            <FormField
                                key={subField.name}
                                field={subField}
                                value={block[subField.name]}
                                name={`${name}[${index}].${subField.name}`}
                                onChange={(_fieldName, fieldValue) =>
                                    onFieldChange(block._id, subField.name, fieldValue)
                                }
                                {...(disabled !== undefined ? { disabled } : {})}
                            />
                        ))}
                    </div>
                </Collapsible.Panel>
            </Collapsible.Root>
        </div>
    );
}

// ============================================================================
// BlocksField
// ============================================================================

export function BlocksField({
    name,
    value,
    field,
    onChange,
    disabled,
}: BaseFieldProps): React.ReactElement {
    const { t } = useTranslation();
    const blockDefs = field.blocks ?? [];
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerAnchorRef = useRef<HTMLDivElement>(null);

    useClickOutside(pickerAnchorRef, () => setPickerOpen(false));

    const {
        blocks,
        addBlock,
        removeBlock,
        duplicateBlock,
        toggleDisabled,
        renameBlock,
        updateBlock,
        reorder,
    } = useBlocksField({ name, value, onChange });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragEnd(event: DragEndEvent): void {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = blocks.findIndex((b) => b._id === active.id);
        const newIndex = blocks.findIndex((b) => b._id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            reorder(oldIndex, newIndex);
        }
    }

    const blockDefMap = new Map<string, BlockDefinition>(
        blockDefs.map((bd) => [bd.type, bd])
    );
    const sortableIds = blocks.map((b) => b._id);

    return (
        <div className="am-blocks">
            {blocks.length === 0 && (
                <div className="am-blocks-empty">
                    <p className="am-blocks-empty-text">{t('fields.blocksEmpty')}</p>
                </div>
            )}

            {blocks.length > 0 && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={sortableIds}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="am-blocks-list">
                            {blocks.map((block, index) => (
                                <SortableBlock
                                    key={block._id}
                                    block={block}
                                    index={index}
                                    blockDef={blockDefMap.get(block._type)}
                                    name={name}
                                    {...(disabled !== undefined ? { disabled } : {})}
                                    onRemove={removeBlock}
                                    onDuplicate={duplicateBlock}
                                    onToggleDisabled={toggleDisabled}
                                    onRename={renameBlock}
                                    onFieldChange={updateBlock}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {!disabled && (
                <div className="am-blocks-footer">
                    <div className="am-blocks-picker-anchor" ref={pickerAnchorRef}>
                        <button
                            type="button"
                            className="am-blocks-btn am-blocks-btn-add"
                            onClick={() => setPickerOpen((o) => !o)}
                            aria-expanded={pickerOpen}
                            aria-haspopup="menu"
                        >
                            <Plus size={16} aria-hidden="true" />
                            {t('fields.blocksAddBlock')}
                        </button>
                        {pickerOpen && blockDefs.length > 0 && (
                            <BlockPicker
                                blocks={blockDefs}
                                onSelect={addBlock}
                                onClose={() => setPickerOpen(false)}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
