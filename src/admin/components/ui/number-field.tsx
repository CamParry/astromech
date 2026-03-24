/**
 * NumberField — numeric input with increment/decrement controls.
 * Built on Base UI NumberField.
 */

import React from 'react';
import { NumberField as BaseNumberField } from '@base-ui/react/number-field';

type NumberFieldProps = {
    id?: string;
    label?: string;
    hint?: string;
    error?: string;
    value?: number | null;
    defaultValue?: number;
    onValueChange?: (value: number | null) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    required?: boolean;
    placeholder?: string;
};

export function NumberField({
    id,
    label,
    hint,
    error,
    value,
    defaultValue,
    onValueChange,
    min,
    max,
    step = 1,
    disabled,
    required,
    placeholder,
}: NumberFieldProps): React.ReactElement {
    return (
        <BaseNumberField.Root
            id={id}
            value={value}
            defaultValue={defaultValue}
            onValueChange={onValueChange}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            required={required}
            className="am-field"
        >
            {label !== undefined && (
                <label className="am-field__label" htmlFor={id}>
                    {label}
                </label>
            )}
            <BaseNumberField.Group className="am-number-field__group">
                <BaseNumberField.Decrement className="am-number-field__btn am-number-field__btn--decrement">
                    −
                </BaseNumberField.Decrement>
                <BaseNumberField.Input
                    className={['am-input am-number-field__input', error ? 'am-input--error' : ''].filter(Boolean).join(' ')}
                    placeholder={placeholder}
                />
                <BaseNumberField.Increment className="am-number-field__btn am-number-field__btn--increment">
                    +
                </BaseNumberField.Increment>
            </BaseNumberField.Group>
            {error !== undefined && <p className="am-field__error">{error}</p>}
            {hint !== undefined && error === undefined && <p className="am-field__hint">{hint}</p>}
        </BaseNumberField.Root>
    );
}

export type { NumberFieldProps };
