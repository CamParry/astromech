import React, { useState } from 'react';
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
    IndentIncrease,
    IndentDecrease,
} from 'lucide-react';
import type { BaseFieldProps, FieldDefinition } from '@/types/index.js';
import { FormField } from '@/admin/components/fields/form-field';
import type { TreeNode } from '@/admin/hooks/use-tree-field.js';
import { useTreeField } from '@/admin/hooks/use-tree-field.js';
import './tree-field.css';

// Lock dragging to the vertical axis — sortable strategy governs reordering
// order, not the drag transform, so without this the item follows the cursor
// horizontally.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
    ...transform,
    x: 0,
});

// ============================================================================
// Sortable sibling list
// ============================================================================

type SortableSiblingListProps = {
    nodes: TreeNode[];
    parentId: string | null;
    depth: number;
    maxDepth?: number | undefined;
    fields: FieldDefinition[];
    fieldName: string;
    disabled?: boolean | undefined;
    onReorder: (activeId: string, overId: string) => void;
    onAddChild: (parentId: string) => void;
    onRemove: (id: string) => void;
    onDuplicate: (id: string) => void;
    onToggleDisabled: (id: string) => void;
    onUpdateField: (id: string, fieldName: string, value: unknown) => void;
    onIndent: (id: string) => void;
    onOutdent: (id: string) => void;
};

function SortableSiblingList({
    nodes,
    parentId,
    depth,
    maxDepth,
    fields,
    fieldName,
    disabled,
    onReorder,
    onAddChild,
    onRemove,
    onDuplicate,
    onToggleDisabled,
    onUpdateField,
    onIndent,
    onOutdent,
}: SortableSiblingListProps): React.ReactElement {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragEnd(event: DragEndEvent): void {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        onReorder(String(active.id), String(over.id));
    }

    const sortableIds = nodes.map((n) => n._id);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <div className="am-tree-list">
                    {nodes.map((node, index) => (
                        <SortableTreeNode
                            key={node._id}
                            node={node}
                            index={index}
                            siblingCount={nodes.length}
                            parentId={parentId}
                            depth={depth}
                            maxDepth={maxDepth}
                            fields={fields}
                            fieldName={fieldName}
                            disabled={disabled}
                            onAddChild={onAddChild}
                            onRemove={onRemove}
                            onDuplicate={onDuplicate}
                            onToggleDisabled={onToggleDisabled}
                            onUpdateField={onUpdateField}
                            onIndent={onIndent}
                            onOutdent={onOutdent}
                            onReorder={onReorder}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

// ============================================================================
// SortableTreeNode
// ============================================================================

type SortableTreeNodeProps = {
    node: TreeNode;
    index: number;
    siblingCount: number;
    parentId: string | null;
    depth: number;
    maxDepth?: number | undefined;
    fields: FieldDefinition[];
    fieldName: string;
    disabled?: boolean | undefined;
    onAddChild: (parentId: string) => void;
    onRemove: (id: string) => void;
    onDuplicate: (id: string) => void;
    onToggleDisabled: (id: string) => void;
    onUpdateField: (id: string, fieldName: string, value: unknown) => void;
    onIndent: (id: string) => void;
    onOutdent: (id: string) => void;
    onReorder: (activeId: string, overId: string) => void;
};

function SortableTreeNode({
    node,
    index,
    siblingCount: _siblingCount,
    parentId,
    depth,
    maxDepth,
    fields,
    fieldName,
    disabled,
    onAddChild,
    onRemove,
    onDuplicate,
    onToggleDisabled,
    onUpdateField,
    onIndent,
    onOutdent,
    onReorder,
}: SortableTreeNodeProps): React.ReactElement {
    const { t } = useTranslation();
    const [open, setOpen] = useState(true);
    const nodeDisabled = node._disabled === true;

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: node._id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
    };

    const children = Array.isArray(node._children) ? node._children : [];
    const canAddChild = maxDepth === undefined || depth + 1 < maxDepth;
    // Indent: can only indent if not the first sibling.
    const canIndent = index > 0;
    // Outdent: can only outdent if has a parent.
    const canOutdent = parentId !== null;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx('am-tree-node', isDragging && 'am-tree-node-dragging')}
        >
            <div className="am-tree-node-inner">
                <Collapsible.Root open={open} onOpenChange={setOpen}>
                    <div
                        className={clsx(
                            'am-tree-node-header',
                            nodeDisabled && 'am-tree-node-header-soft-disabled'
                        )}
                    >
                        {!disabled && (
                            <button
                                type="button"
                                className="am-tree-drag-handle"
                                aria-label={t('fields.treeDragHandle')}
                                {...attributes}
                                {...listeners}
                            >
                                <GripVertical size={16} />
                            </button>
                        )}

                        <div className="am-tree-node-meta">
                            <span className="am-tree-node-title">
                                {t('fields.treeNode', { number: index + 1 })}
                            </span>
                            {nodeDisabled && (
                                <span className="am-tree-node-disabled-badge">
                                    {t('fields.treeDisabledBadge')}
                                </span>
                            )}
                        </div>

                        <div className="am-tree-node-controls">
                            {!disabled && (
                                <>
                                    <button
                                        type="button"
                                        className="am-tree-btn am-tree-btn-icon"
                                        onClick={() => onIndent(node._id)}
                                        disabled={!canIndent}
                                        aria-label={t('fields.treeIndent')}
                                        title={t('fields.treeIndent')}
                                    >
                                        <IndentIncrease size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className="am-tree-btn am-tree-btn-icon"
                                        onClick={() => onOutdent(node._id)}
                                        disabled={!canOutdent}
                                        aria-label={t('fields.treeOutdent')}
                                        title={t('fields.treeOutdent')}
                                    >
                                        <IndentDecrease size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className="am-tree-btn am-tree-btn-icon"
                                        onClick={() => onToggleDisabled(node._id)}
                                        aria-label={
                                            nodeDisabled
                                                ? t('fields.treeEnable')
                                                : t('fields.treeDisable')
                                        }
                                        title={
                                            nodeDisabled
                                                ? t('fields.treeEnable')
                                                : t('fields.treeDisable')
                                        }
                                    >
                                        {nodeDisabled ? (
                                            <EyeOff size={16} />
                                        ) : (
                                            <Eye size={16} />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        className="am-tree-btn am-tree-btn-icon"
                                        onClick={() => onDuplicate(node._id)}
                                        aria-label={t('fields.treeDuplicate')}
                                        title={t('fields.treeDuplicate')}
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className="am-tree-btn am-tree-btn-icon am-tree-btn-remove"
                                        onClick={() => onRemove(node._id)}
                                        aria-label={t('fields.treeRemove')}
                                        title={t('fields.treeRemove')}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                            <Collapsible.Trigger
                                className="am-tree-btn am-tree-btn-icon"
                                aria-label={
                                    open
                                        ? t('fields.treeCollapse')
                                        : t('fields.treeExpand')
                                }
                            >
                                {open ? (
                                    <ChevronUp size={16} />
                                ) : (
                                    <ChevronDown size={16} />
                                )}
                            </Collapsible.Trigger>
                        </div>
                    </div>

                    <Collapsible.Panel className="am-tree-node-panel">
                        <div
                            className={clsx(
                                'am-tree-node-content',
                                nodeDisabled && 'am-tree-node-content-disabled'
                            )}
                        >
                            {fields.map((subField) => (
                                <FormField
                                    key={subField.name}
                                    field={subField}
                                    value={node[subField.name]}
                                    name={`${fieldName}[${node._id}].${subField.name}`}
                                    onChange={(_n, v) =>
                                        onUpdateField(node._id, subField.name, v)
                                    }
                                    {...(disabled !== undefined ? { disabled } : {})}
                                />
                            ))}
                        </div>

                        {/* Per-node children (recursive) */}
                        {children.length > 0 && (
                            <div className="am-tree-children">
                                <SortableSiblingList
                                    nodes={children}
                                    parentId={node._id}
                                    depth={depth + 1}
                                    maxDepth={maxDepth}
                                    fields={fields}
                                    fieldName={fieldName}
                                    disabled={disabled}
                                    onReorder={onReorder}
                                    onAddChild={onAddChild}
                                    onRemove={onRemove}
                                    onDuplicate={onDuplicate}
                                    onToggleDisabled={onToggleDisabled}
                                    onUpdateField={onUpdateField}
                                    onIndent={onIndent}
                                    onOutdent={onOutdent}
                                />
                            </div>
                        )}

                        {!disabled && canAddChild && (
                            <div className="am-tree-node-footer">
                                <button
                                    type="button"
                                    onClick={() => onAddChild(node._id)}
                                    className="am-tree-btn am-tree-btn-add-child"
                                >
                                    <Plus size={14} aria-hidden="true" />
                                    {t('fields.treeAddChild')}
                                </button>
                            </div>
                        )}
                        {!disabled && !canAddChild && (
                            <div className="am-tree-node-footer">
                                <span
                                    style={{
                                        fontSize: '0.8125rem',
                                        color: 'var(--am-color-text-muted)',
                                    }}
                                >
                                    {t('fields.treeMaxDepthReached')}
                                </span>
                            </div>
                        )}
                    </Collapsible.Panel>
                </Collapsible.Root>
            </div>

            {/* Empty children still need a DndContext wrapper for when children exist
                but the panel is collapsed — we render the children inside the panel
                above so they are only mounted when open. Nothing extra needed here. */}
        </div>
    );
}

// ============================================================================
// TreeField (root)
// ============================================================================

export function TreeField({
    name,
    value,
    field,
    required: _required,
    onChange,
    disabled,
}: BaseFieldProps): React.ReactElement {
    const { t } = useTranslation();
    const fields = field.fields ?? [];
    const maxDepth = field.maxDepth;

    const {
        nodes,
        addRoot,
        addChild,
        removeNode,
        duplicateNode,
        toggleDisabled,
        updateNodeField,
        reorderNodes,
        indentNode,
        outdentNode,
    } = useTreeField({ name, value, onChange, maxDepth });

    return (
        <div className="am-tree">
            {nodes.length > 0 && (
                <SortableSiblingList
                    nodes={nodes}
                    parentId={null}
                    depth={0}
                    maxDepth={maxDepth}
                    fields={fields}
                    fieldName={name}
                    disabled={disabled}
                    onReorder={reorderNodes}
                    onAddChild={addChild}
                    onRemove={removeNode}
                    onDuplicate={duplicateNode}
                    onToggleDisabled={toggleDisabled}
                    onUpdateField={updateNodeField}
                    onIndent={indentNode}
                    onOutdent={outdentNode}
                />
            )}

            {!disabled && (
                <div className="am-tree-footer">
                    <button
                        type="button"
                        onClick={addRoot}
                        className="am-tree-btn am-tree-btn-add"
                    >
                        <Plus size={16} aria-hidden="true" />
                        {t('fields.treeAddRoot')}
                    </button>
                </div>
            )}
        </div>
    );
}
