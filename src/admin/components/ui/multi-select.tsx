import { Combobox } from '@base-ui/react/combobox';
import React, { useRef, useId } from 'react';
import { CheckIcon, XIcon } from 'lucide-react';

export type MultiSelectOption = { label: string; value: string };

export type MultiSelectProps<T = MultiSelectOption> = {
    options: T[];
    value?: T[];
    onValueChange?: (value: T[]) => void;
    itemToStringValue?: (item: T) => string;
    itemToStringLabel?: (item: T) => string;
    name?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    multiple?: boolean;
};

export function MultiSelect<T = MultiSelectOption>({
    options,
    value,
    onValueChange,
    itemToStringValue,
    itemToStringLabel,
    name,
    required,
    disabled,
    placeholder = 'Select...',
    multiple = true,
}: MultiSelectProps<T>): React.ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const id = useId();

    const selectedValues = value ?? [];

    return (
        <Combobox.Root
            items={options}
            multiple={multiple}
            name={name}
            value={selectedValues}
            onValueChange={(val: T | T[] | null) => {
                const arr = val == null ? [] : Array.isArray(val) ? val : [val];
                onValueChange?.(arr);
            }}
            required={!!required}
            disabled={disabled}
            itemToStringValue={itemToStringValue}
            itemToStringLabel={itemToStringLabel}
        >
            <div className="am-multiselect">
                <Combobox.Chips className="am-multiselect-chips" ref={containerRef}>
                    <Combobox.Value>
                        {(val: T[]) => (
                            <React.Fragment>
                                {val.map((v) => {
                                    const label = itemToStringLabel ? itemToStringLabel(v) : (v as MultiSelectOption).label;
                                    const key = itemToStringValue ? itemToStringValue(v) : (v as MultiSelectOption).value;
                                    return (
                                        <Combobox.Chip
                                            key={key}
                                            className="am-multiselect-chip"
                                            aria-label={label}
                                        >
                                            {label}
                                            <Combobox.ChipRemove
                                                className="am-multiselect-chip-remove"
                                                aria-label="Remove"
                                            >
                                                <XIcon size={16} />
                                            </Combobox.ChipRemove>
                                        </Combobox.Chip>
                                    );
                                })}
                                <Combobox.Input
                                    id={id}
                                    placeholder={val.length > 0 ? '' : placeholder}
                                    className="am-multiselect-input"
                                />
                            </React.Fragment>
                        )}
                    </Combobox.Value>
                </Combobox.Chips>
            </div>
            <Combobox.Portal>
                <Combobox.Positioner
                    className="am-multiselect-positioner"
                    sideOffset={4}
                    anchor={containerRef}
                >
                    <Combobox.Popup className="am-multiselect-popup">
                        <Combobox.Empty className="am-multiselect-empty">No results.</Combobox.Empty>
                        <Combobox.List>
                            {(option: T) => {
                                const label = itemToStringLabel ? itemToStringLabel(option) : (option as MultiSelectOption).label;
                                const key = itemToStringValue ? itemToStringValue(option) : (option as MultiSelectOption).value;
                                return (
                                    <Combobox.Item
                                        key={key}
                                        className="am-multiselect-item"
                                        value={option}
                                    >
                                        <Combobox.ItemIndicator className="am-multiselect-item-indicator">
                                            <CheckIcon className="am-multiselect-item-indicator-icon" />
                                        </Combobox.ItemIndicator>
                                        <div className="am-multiselect-item-text">{label}</div>
                                    </Combobox.Item>
                                );
                            }}
                        </Combobox.List>
                    </Combobox.Popup>
                </Combobox.Positioner>
            </Combobox.Portal>
        </Combobox.Root>
    );
}
