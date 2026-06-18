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
} from 'lucide-react';
import type { BaseFieldProps, FieldDefinition } from '@/types/index.js';
import { FormField } from '@/admin/components/fields/form-field';
import { InlineTitle } from '@/admin/components/fields/inline-title';
import './repeater-field.css';

// Lock dragging to the vertical axis — verticalListSortingStrategy only governs
// reordering, not the drag transform, so without this the item follows the
// cursor horizontally too.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
    ...transform,
    x: 0,
});

type ItemWithId = Record<string, unknown> & {
    _id: string;
    _disabled?: boolean;
    _title?: string;
};

const withId = (item: Record<string, unknown>): ItemWithId => ({
    ...item,
    _id: typeof item._id === 'string' ? item._id : crypto.randomUUID(),
});

// ============================================================================
// SortableRepeaterItem
// ============================================================================

type SortableRepeaterItemProps = {
    item: ItemWithId;
    index: number;
    itemsLength: number;
    required: boolean;
    fields: FieldDefinition[];
    name: string;
    disabled?: boolean;
    onRemove: (index: number) => void;
    onDuplicate: (index: number) => void;
    onToggleDisabled: (index: number) => void;
    onRename: (index: number, title: string | undefined) => void;
    onFieldChange: (fieldName: string, fieldValue: unknown) => void;
};

function SortableRepeaterItem({
    item,
    index,
    itemsLength,
    required,
    fields,
    name,
    disabled,
    onRemove,
    onDuplicate,
    onToggleDisabled,
    onRename,
    onFieldChange,
}: SortableRepeaterItemProps): React.ReactElement {
    const { t } = useTranslation();
    const [open, setOpen] = useState(true);
    const itemDisabled = item._disabled === true;

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({
            id: item._id,
        });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx(
                'am-repeater-item',
                isDragging && 'am-repeater-item-dragging'
            )}
        >
            <Collapsible.Root open={open} onOpenChange={setOpen}>
                <div
                    className={clsx(
                        'am-repeater-item-header',
                        itemDisabled && 'am-repeater-item-header-soft-disabled'
                    )}
                >
                    {!disabled && (
                        <button
                            type="button"
                            className="am-repeater-drag-handle"
                            aria-label={t('fields.repeaterDragHandle')}
                            {...attributes}
                            {...listeners}
                        >
                            <GripVertical size={16} />
                        </button>
                    )}

                    <div className="am-repeater-item-meta">
                        <InlineTitle
                            value={
                                typeof item._title === 'string' ? item._title : undefined
                            }
                            fallback={t('fields.repeaterItem', { number: index + 1 })}
                            editLabel={t('fields.repeaterRename')}
                            onCommit={(next) => onRename(index, next)}
                            {...(disabled !== undefined ? { disabled } : {})}
                        />
                        {itemDisabled && (
                            <span className="am-repeater-item-disabled-badge">
                                {t('fields.repeaterDisabledBadge')}
                            </span>
                        )}
                    </div>

                    <div className="am-repeater-item-controls">
                        {!disabled && (
                            <>
                                <button
                                    type="button"
                                    className="am-repeater-btn am-repeater-btn-icon"
                                    onClick={() => onToggleDisabled(index)}
                                    aria-label={
                                        itemDisabled
                                            ? t('fields.repeaterEnable')
                                            : t('fields.repeaterDisable')
                                    }
                                    title={
                                        itemDisabled
                                            ? t('fields.repeaterEnable')
                                            : t('fields.repeaterDisable')
                                    }
                                >
                                    {itemDisabled ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="am-repeater-btn am-repeater-btn-icon"
                                    onClick={() => onDuplicate(index)}
                                    aria-label={t('fields.repeaterDuplicate')}
                                    title={t('fields.repeaterDuplicate')}
                                >
                                    <Copy size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onRemove(index)}
                                    disabled={itemsLength === 1 && required}
                                    className="am-repeater-btn am-repeater-btn-icon am-repeater-btn-remove"
                                    aria-label={t('fields.repeaterRemove')}
                                    title={t('fields.repeaterRemove')}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                        <Collapsible.Trigger
                            className="am-repeater-btn am-repeater-btn-icon"
                            aria-label={
                                open
                                    ? t('fields.repeaterCollapse')
                                    : t('fields.repeaterExpand')
                            }
                        >
                            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </Collapsible.Trigger>
                    </div>
                </div>

                <Collapsible.Panel className="am-repeater-item-panel">
                    <div
                        className={clsx(
                            'am-repeater-item-content',
                            itemDisabled && 'am-repeater-item-content-disabled'
                        )}
                    >
                        {fields.map((subField) => (
                            <FormField
                                key={subField.name}
                                field={subField}
                                value={item[subField.name]}
                                name={`${name}[${index}].${subField.name}`}
                                onChange={onFieldChange}
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
// RepeaterField
// ============================================================================

export function RepeaterField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps): React.ReactElement {
    const { t } = useTranslation();
    const fields = field.fields || [];
    const arrayValue = Array.isArray(value) ? value : [];
    const [items, setItems] = useState<ItemWithId[]>(
        (arrayValue.length > 0 ? arrayValue : [{}]).map(withId)
    );

    // `_id` is a persisted UUID (stable item identity for diffs/versioning), so
    // items commit as-is — no key stripping.
    const commit = (next: ItemWithId[]): void => {
        setItems(next);
        onChange(name, next);
    };

    function handleItemFieldChange(
        itemIndex: number,
        fieldName: string,
        fieldValue: unknown
    ): void {
        commit(
            items.map((item, i) =>
                i === itemIndex ? { ...item, [fieldName]: fieldValue } : item
            )
        );
    }

    const handleAdd = (): void => {
        commit([...items, withId({})]);
    };

    const handleRemove = (index: number): void => {
        if (items.length === 1 && required) return;
        commit(items.filter((_, i) => i !== index));
    };

    const handleDuplicate = (index: number): void => {
        const source = items[index];
        if (source === undefined) return;
        const clone: ItemWithId = { ...source, _id: crypto.randomUUID() };
        const next = [...items];
        next.splice(index + 1, 0, clone);
        commit(next);
    };

    // Empty/blank title omits `_title` entirely (default-by-absence).
    const handleRename = (index: number, title: string | undefined): void => {
        commit(
            items.map((item, i) => {
                if (i !== index) return item;
                if (title === undefined || title === '') {
                    const { _title: _removed, ...rest } = item;
                    return rest as ItemWithId;
                }
                return { ...item, _title: title };
            })
        );
    };

    // Re-enabling omits `_disabled` entirely (default-by-absence) rather than
    // storing `_disabled: false`, keeping payloads clean.
    const handleToggleDisabled = (index: number): void => {
        commit(
            items.map((item, i) => {
                if (i !== index) return item;
                if (item._disabled === true) {
                    const { _disabled: _removed, ...rest } = item;
                    return rest as ItemWithId;
                }
                return { ...item, _disabled: true };
            })
        );
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragEnd(event: DragEndEvent): void {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = items.findIndex((i) => i._id === active.id);
        const newIndex = items.findIndex((i) => i._id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const next = [...items];
        const [moved] = next.splice(oldIndex, 1);
        if (moved !== undefined) {
            next.splice(newIndex, 0, moved);
            commit(next);
        }
    }

    const sortableIds = items.map((i) => i._id);

    return (
        <div className="am-repeater">
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
                    <div className="am-repeater-list">
                        {items.map((item, index) => (
                            <SortableRepeaterItem
                                key={item._id}
                                item={item}
                                index={index}
                                itemsLength={items.length}
                                required={required ?? false}
                                fields={fields}
                                name={name}
                                {...(disabled !== undefined ? { disabled } : {})}
                                onRemove={handleRemove}
                                onDuplicate={handleDuplicate}
                                onToggleDisabled={handleToggleDisabled}
                                onRename={handleRename}
                                onFieldChange={(fieldName, fieldValue) =>
                                    handleItemFieldChange(index, fieldName, fieldValue)
                                }
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {!disabled && (
                <div className="am-repeater-footer">
                    <button
                        type="button"
                        onClick={handleAdd}
                        className="am-repeater-btn am-repeater-btn-add"
                    >
                        <Plus size={16} aria-hidden="true" />
                        {t('fields.repeaterAddItem')}
                    </button>
                </div>
            )}
        </div>
    );
}
