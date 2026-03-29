import { Checkbox } from './checkbox.js';

export type CheckboxGroupOption = { label: string; value: string };

export type CheckboxGroupProps = {
    options: CheckboxGroupOption[];
    value?: string[];
    onChange?: (value: string[]) => void;
    name?: string;
    disabled?: boolean;
};

export function CheckboxGroup({ options, value = [], onChange, name, disabled }: CheckboxGroupProps) {
    function handleChange(optValue: string, checked: boolean) {
        const next = checked
            ? [...value, optValue]
            : value.filter((v) => v !== optValue);
        onChange?.(next);
    }

    return (
        <div className="am-checkbox-group">
            {options.map((opt) => (
                <Checkbox
                    key={opt.value}
                    id={name ? `${name}--${opt.value}` : undefined}
                    label={opt.label}
                    checked={value.includes(opt.value)}
                    disabled={disabled}
                    onChange={(checked) => handleChange(opt.value, checked)}
                />
            ))}
        </div>
    );
}
