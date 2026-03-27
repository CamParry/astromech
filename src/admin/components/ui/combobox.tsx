/**
 * Combobox — searchable select built on Base UI Combobox.
 * Used for relation fields and entry lookups.
 */

import React from 'react';
import { Combobox as BaseCombobox } from '@base-ui/react/combobox';
import { ChevronDown, X } from 'lucide-react';

type ComboboxOption = {
    label: string;
    value: string;
};

type ComboboxProps = {
    id?: string;
    label?: string;
    hint?: string;
    error?: string;
    placeholder?: string;
    options: ComboboxOption[];
    value?: string | null;
    onValueChange?: (value: string | null) => void;
    disabled?: boolean;
    multiple?: boolean;
};

export function Combobox({
    id,
    label,
    hint,
    error,
    placeholder = 'Search…',
    options,
    value,
    onValueChange,
    disabled,
    multiple = false,
}: ComboboxProps): React.ReactElement {
    return (
        <div className="am-field">
            {label !== undefined && (
                <label className="am-field__label" htmlFor={id}>
                    {label}
                </label>
            )}
            <div className="am-combobox">
                <BaseCombobox.Root
                    items={options}
                    value={value}
                    onValueChange={(val) => {
                        if (onValueChange) {
                            onValueChange(Array.isArray(val) ? (val[0] ?? null) : val);
                        }
                    }}
                    disabled={disabled}
                    multiple={multiple}
                >
                    <BaseCombobox.InputGroup className="am-combobox__input-group">
                        <BaseCombobox.Input
                            id={id}
                            className={[
                                'am-input am-combobox__input',
                                error ? 'am-input--error' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            placeholder={placeholder}
                        />
                        <BaseCombobox.Clear
                            className="am-combobox__clear"
                            aria-label="Clear"
                        >
                            <X size={14} />
                        </BaseCombobox.Clear>
                        <BaseCombobox.Trigger
                            className="am-combobox__trigger"
                            aria-label="Open"
                        >
                            <ChevronDown size={14} />
                        </BaseCombobox.Trigger>
                    </BaseCombobox.InputGroup>
                    <BaseCombobox.Portal>
                        <BaseCombobox.Positioner
                            className="am-dropdown__positioner"
                            sideOffset={4}
                        >
                            <BaseCombobox.Popup className="am-dropdown__popup">
                                <BaseCombobox.Empty className="am-combobox__empty">
                                    No results found
                                </BaseCombobox.Empty>
                                <BaseCombobox.List className="am-combobox__list">
                                    {(item: ComboboxOption) => (
                                        <BaseCombobox.Item
                                            key={item.value}
                                            value={item}
                                            className="am-dropdown__item"
                                        >
                                            {item.label}
                                        </BaseCombobox.Item>
                                    )}
                                </BaseCombobox.List>
                            </BaseCombobox.Popup>
                        </BaseCombobox.Positioner>
                    </BaseCombobox.Portal>
                </BaseCombobox.Root>
            </div>
            {error !== undefined && <p className="am-field__error">{error}</p>}
            {hint !== undefined && error === undefined && (
                <p className="am-field__hint">{hint}</p>
            )}
        </div>
    );
}

export type { ComboboxProps, ComboboxOption };
