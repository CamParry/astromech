import React from 'react';
import { useFieldControl } from '../fields/field-control-context';

export type RadioGroupOption = { label: string; value: string };

export type RadioGroupProps = {
    options: RadioGroupOption[];
    value?: string;
    onChange?: (value: string) => void;
    name?: string;
    disabled?: boolean;
    /** The id of the label naming the group. */
    'aria-labelledby'?: string | undefined;
};

export function RadioGroup({
    options,
    value,
    onChange,
    name,
    disabled,
    'aria-labelledby': labelledBy,
}: RadioGroupProps): React.ReactElement {
    const { ariaProps } = useFieldControl();
    return (
        <div className="am-radio-group" role="radiogroup" aria-labelledby={labelledBy}>
            {options.map((opt) => {
                const id = `${name ?? 'radio'}--${opt.value}`;
                return (
                    <label key={opt.value} className="am-radio-group-item" htmlFor={id}>
                        <input
                            id={id}
                            type="radio"
                            name={name}
                            value={opt.value}
                            checked={value === opt.value}
                            onChange={() => onChange?.(opt.value)}
                            className="am-radio-group-input"
                            disabled={disabled}
                            {...ariaProps}
                        />
                        <span className="am-radio-group-label">{opt.label}</span>
                    </label>
                );
            })}
        </div>
    );
}
