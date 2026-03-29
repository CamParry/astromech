import React from 'react';

export type RadioGroupOption = { label: string; value: string };

export type RadioGroupProps = {
    options: RadioGroupOption[];
    value?: string;
    onChange?: (value: string) => void;
    name?: string;
    disabled?: boolean;
};

export function RadioGroup({ options, value, onChange, name, disabled }: RadioGroupProps): React.ReactElement {
    return (
        <div className="am-radio-group">
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
                        />
                        <span className="am-radio-group-label">{opt.label}</span>
                    </label>
                );
            })}
        </div>
    );
}
