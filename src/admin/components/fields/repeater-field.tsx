import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible } from '@base-ui/react';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { BaseFieldProps, FieldDefinition } from '@/types/index.js';
import { FieldInput } from '@/admin/components/fields/field-input';
import './repeater-field.css';

type ItemWithId = Record<string, unknown> & { _id: string };

const withId = (item: Record<string, unknown>): ItemWithId => ({
    ...item,
    _id: typeof item._id === 'string' ? item._id : crypto.randomUUID(),
});

type RepeaterItemProps = {
    item: ItemWithId;
    index: number;
    itemsLength: number;
    required: boolean;
    fields: FieldDefinition[];
    name: string;
    disabled?: boolean;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onRemove: (index: number) => void;
    onFieldChange: (fieldName: string, fieldValue: unknown) => void;
};

function RepeaterItem({
    item,
    index,
    itemsLength,
    required,
    fields,
    name,
    disabled,
    onMoveUp,
    onMoveDown,
    onRemove,
    onFieldChange,
}: RepeaterItemProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(true);

    return (
        <Collapsible.Root open={open} onOpenChange={setOpen} className="am-repeater__item">
            <div className="am-repeater__item-header">
                <span className="am-repeater__item-title">{t('fields.repeaterItem', { number: index + 1 })}</span>
                <div className="am-repeater__item-controls">
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => onMoveUp(index)}
                            disabled={index === 0}
                            className="am-repeater__btn am-repeater__btn--icon"
                            aria-label={t('fields.repeaterMoveUp')}
                        >
                            <ChevronUp size={16} />
                        </button>
                    )}
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => onMoveDown(index)}
                            disabled={index === itemsLength - 1}
                            className="am-repeater__btn am-repeater__btn--icon"
                            aria-label={t('fields.repeaterMoveDown')}
                        >
                            <ChevronDown size={16} />
                        </button>
                    )}
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => onRemove(index)}
                            disabled={itemsLength === 1 && required}
                            className="am-repeater__btn am-repeater__btn--icon am-repeater__btn--remove"
                            aria-label={t('fields.repeaterRemove')}
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    <Collapsible.Trigger
                        className="am-repeater__btn am-repeater__btn--icon"
                        aria-label={open ? t('fields.repeaterCollapse') : t('fields.repeaterExpand')}
                    >
                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Collapsible.Trigger>
                </div>
            </div>
            <Collapsible.Panel className="am-repeater__item-panel">
                <div className="am-repeater__item-content">
                    {fields.map((subField) => (
                        <FieldInput
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
    );
}

export function RepeaterField({ name, value, field, required, onChange, disabled }: BaseFieldProps) {
    const { t } = useTranslation();
    const fields = field.fields || [];
    const arrayValue = Array.isArray(value) ? value : [];
    const [items, setItems] = useState<ItemWithId[]>(
        (arrayValue.length > 0 ? arrayValue : [{}]).map(withId)
    );

    function handleItemFieldChange(itemIndex: number, fieldName: string, fieldValue: unknown) {
        setItems((prev) => {
            const next = prev.map((item, i) =>
                i === itemIndex ? { ...item, [fieldName]: fieldValue } : item
            );
            onChange(name, next.map(({ _id, ...rest }) => rest));
            return next;
        });
    }

    const handleAdd = () => {
        const next = [...items, withId({})];
        setItems(next);
        onChange(name, next.map(({ _id, ...rest }) => rest));
    };

    const handleRemove = (index: number) => {
        if (items.length === 1 && required) return;
        const next = items.filter((_, i) => i !== index);
        setItems(next);
        onChange(name, next.map(({ _id, ...rest }) => rest));
    };

    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newItems = [...items];
        const temp = newItems[index - 1];
        if (temp !== undefined && newItems[index] !== undefined) {
            newItems[index - 1] = newItems[index]!;
            newItems[index] = temp;
            setItems(newItems);
            onChange(name, newItems.map(({ _id, ...rest }) => rest));
        }
    };

    const handleMoveDown = (index: number) => {
        if (index === items.length - 1) return;
        const newItems = [...items];
        const temp = newItems[index];
        if (temp !== undefined && newItems[index + 1] !== undefined) {
            newItems[index] = newItems[index + 1]!;
            newItems[index + 1] = temp;
            setItems(newItems);
            onChange(name, newItems.map(({ _id, ...rest }) => rest));
        }
    };

    return (
        <div className="am-repeater">
            {items.map((item, index) => (
                <RepeaterItem
                    key={item._id}
                    item={item}
                    index={index}
                    itemsLength={items.length}
                    required={required ?? false}
                    fields={fields}
                    name={name}
                    {...(disabled !== undefined ? { disabled } : {})}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    onRemove={handleRemove}
                    onFieldChange={(fieldName, fieldValue) => handleItemFieldChange(index, fieldName, fieldValue)}
                />
            ))}
            {!disabled && (
                <button
                    type="button"
                    onClick={handleAdd}
                    className="am-repeater__btn am-repeater__btn--add"
                >
                    {t('fields.repeaterAddItem')}
                </button>
            )}
        </div>
    );
}
