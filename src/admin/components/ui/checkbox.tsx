import React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';

type CheckboxProps = {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    label?: React.ReactNode;
    disabled?: boolean;
    id?: string;
};

export function Checkbox({ checked, defaultChecked, onChange, label, disabled, id }: CheckboxProps): React.ReactElement {
    return (
        <label className="am-checkbox" htmlFor={id}>
            <BaseCheckbox.Root
                id={id}
                className="am-checkbox__root"
                checked={checked}
                defaultChecked={defaultChecked}
                onCheckedChange={onChange}
                disabled={disabled}
            >
                <BaseCheckbox.Indicator className="am-checkbox__indicator">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </BaseCheckbox.Indicator>
            </BaseCheckbox.Root>
            {label !== undefined && <span className="am-checkbox__label">{label}</span>}
        </label>
    );
}

export type { CheckboxProps };
