import React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = {
    value: string;
    label: string;
};

export type SelectProps = {
    value?: string;
    onValueChange?: (value: string | null) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    className?: string;
    style?: React.CSSProperties;
    triggerPrefix?: string;
};

export function Select({
    value,
    onValueChange,
    options,
    placeholder = 'Select...',
    disabled,
    required,
    name,
    id,
    className,
    style,
    triggerPrefix,
}: SelectProps): React.ReactElement {
    const currentLabel = options.find((o) => o.value === value)?.label;

    return (
        <BaseSelect.Root
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            required={required}
            name={name}
        >
            <BaseSelect.Trigger id={id} className={['am-select__trigger', className].filter(Boolean).join(' ')} style={style}>
                {triggerPrefix && <span className="am-select__trigger-prefix">{triggerPrefix}</span>}
                <BaseSelect.Value className="am-visually-hidden" placeholder={placeholder} />
                <span className="am-select__label" aria-hidden>
                    {currentLabel ?? <span className="am-select__placeholder-text">{placeholder}</span>}
                </span>
                <BaseSelect.Icon className="am-select__icon">
                    <ChevronDown size={12} />
                </BaseSelect.Icon>
            </BaseSelect.Trigger>
            <BaseSelect.Portal>
                <BaseSelect.Positioner className="am-select__positioner" sideOffset={4} alignItemWithTrigger={false} align="start">
                    <BaseSelect.Popup className="am-select__popup">
                        <BaseSelect.List>
                            {options.map((opt) => (
                                <BaseSelect.Item
                                    key={opt.value}
                                    value={opt.value}
                                    className="am-select__item"
                                >
                                    <BaseSelect.ItemIndicator className="am-select__item-indicator">
                                        <Check size={10} />
                                    </BaseSelect.ItemIndicator>
                                    <BaseSelect.ItemText className="am-select__item-text">
                                        {opt.label}
                                    </BaseSelect.ItemText>
                                </BaseSelect.Item>
                            ))}
                        </BaseSelect.List>
                    </BaseSelect.Popup>
                </BaseSelect.Positioner>
            </BaseSelect.Portal>
        </BaseSelect.Root>
    );
}
