import { Combobox } from '@base-ui/react/combobox';
import React, { useRef, useId } from 'react';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFieldControl } from '@/admin/components/fields/field-control-context';

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

// Single-select renders a plain combobox input; multi-select renders chips.
// The two need literal `multiple` values, so they get their own roots.
export function MultiSelect<T = MultiSelectOption>({
    options,
    value,
    onValueChange,
    itemToStringValue,
    itemToStringLabel,
    name,
    required,
    disabled,
    placeholder,
    multiple = true,
}: MultiSelectProps<T>): React.ReactElement {
    const { t } = useTranslation();
    const { ariaProps } = useFieldControl();
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const id = useId();

    const selectedValues = value ?? [];
    const placeholderText = placeholder ?? t('fields.multiSelectPlaceholder');
    const labelOf = (item: T) =>
        itemToStringLabel ? itemToStringLabel(item) : (item as MultiSelectOption).label;
    const valueOf = (item: T) =>
        itemToStringValue ? itemToStringValue(item) : (item as MultiSelectOption).value;

    const rootProps = {
        items: options,
        name,
        required: !!required,
        disabled,
        itemToStringValue,
        itemToStringLabel,
    };

    const popup = (
        <Combobox.Portal>
            <Combobox.Positioner
                className="am-multiselect-positioner"
                sideOffset={4}
                anchor={anchorRef}
            >
                <Combobox.Popup className="am-multiselect-popup">
                    <Combobox.Empty className="am-multiselect-empty">
                        {t('fields.multiSelectNoResults')}
                    </Combobox.Empty>
                    <Combobox.List>
                        {(option: T) => (
                            <Combobox.Item
                                key={valueOf(option)}
                                className="am-multiselect-item"
                                value={option}
                            >
                                <Combobox.ItemIndicator className="am-multiselect-item-indicator">
                                    <CheckIcon className="am-multiselect-item-indicator-icon" />
                                </Combobox.ItemIndicator>
                                <div className="am-multiselect-item-text">
                                    {labelOf(option)}
                                </div>
                            </Combobox.Item>
                        )}
                    </Combobox.List>
                </Combobox.Popup>
            </Combobox.Positioner>
        </Combobox.Portal>
    );

    if (!multiple) {
        return (
            <Combobox.Root
                {...rootProps}
                multiple={false}
                value={selectedValues[0] ?? null}
                onValueChange={(val: T | null) => {
                    onValueChange?.(val == null ? [] : [val]);
                }}
            >
                <Combobox.InputGroup className="am-multiselect-single" ref={anchorRef}>
                    <Combobox.Input
                        id={id}
                        placeholder={placeholderText}
                        className="am-multiselect-single-input"
                        onFocus={(event) => {
                            event.currentTarget.select();
                        }}
                        {...ariaProps}
                    />
                    <Combobox.Clear
                        className="am-multiselect-button"
                        aria-label={t('fields.multiSelectClear')}
                    >
                        <XIcon size={12} />
                    </Combobox.Clear>
                    <Combobox.Trigger
                        className="am-multiselect-button"
                        aria-label={t('fields.multiSelectOpen')}
                    >
                        <ChevronDownIcon size={12} />
                    </Combobox.Trigger>
                </Combobox.InputGroup>
                {popup}
            </Combobox.Root>
        );
    }

    return (
        <Combobox.Root
            {...rootProps}
            multiple
            value={selectedValues}
            onValueChange={(val: T[]) => {
                onValueChange?.(val);
            }}
        >
            <div className="am-multiselect">
                <Combobox.Chips className="am-multiselect-chips" ref={anchorRef}>
                    <Combobox.Value>
                        {(val: T[]) => (
                            <React.Fragment>
                                {val.map((v) => (
                                    <Combobox.Chip
                                        key={valueOf(v)}
                                        className="am-multiselect-chip"
                                        aria-label={labelOf(v)}
                                    >
                                        <span className="am-multiselect-chip-label">
                                            {labelOf(v)}
                                        </span>
                                        <Combobox.ChipRemove
                                            className="am-multiselect-chip-remove"
                                            aria-label={t('fields.multiSelectRemove')}
                                        >
                                            <XIcon size={12} />
                                        </Combobox.ChipRemove>
                                    </Combobox.Chip>
                                ))}
                                <Combobox.Input
                                    id={id}
                                    placeholder={val.length > 0 ? '' : placeholderText}
                                    className="am-multiselect-input"
                                    {...ariaProps}
                                />
                            </React.Fragment>
                        )}
                    </Combobox.Value>
                </Combobox.Chips>
            </div>
            {popup}
        </Combobox.Root>
    );
}
