import React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

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
    return (
        <BaseSelect.Root
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            required={required}
            name={name}
        >
            <BaseSelect.Trigger
                id={id}
                className={clsx('am-select-trigger', className)}
                style={style}
            >
                {triggerPrefix && (
                    <span className="am-select-trigger-prefix">{triggerPrefix}</span>
                )}
                <BaseSelect.Value
                    className="am-select-trigger-value"
                    placeholder={placeholder}
                />
                <BaseSelect.Icon className="am-select-icon">
                    <ChevronDown size={12} />
                </BaseSelect.Icon>
            </BaseSelect.Trigger>
            <BaseSelect.Portal>
                <BaseSelect.Positioner
                    className="am-select-positioner"
                    sideOffset={4}
                    alignItemWithTrigger={false}
                    align="start"
                >
                    <BaseSelect.Popup className="am-select-popup">
                        <BaseSelect.List>
                            {options.map((opt) => (
                                <BaseSelect.Item
                                    key={opt.value}
                                    value={opt.value}
                                    className="am-select-item"
                                >
                                    <BaseSelect.ItemIndicator className="am-select-item-indicator">
                                        <Check size={10} />
                                    </BaseSelect.ItemIndicator>
                                    <BaseSelect.ItemText className="am-select-item-text">
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
