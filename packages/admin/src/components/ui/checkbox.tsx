import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import React from 'react';
import { useFieldControl } from '../fields/field-control-context';

type CheckboxProps = {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    label?: React.ReactNode;
    disabled?: boolean;
    id?: string;
    /** The accessible name when there is no visible `label`. */
    ariaLabel?: string;
};

export function Checkbox({
    checked,
    defaultChecked,
    onChange,
    label,
    disabled,
    id,
    ariaLabel,
}: CheckboxProps): React.ReactElement {
    const { ariaProps } = useFieldControl();
    return (
        <label className="am-checkbox" htmlFor={id}>
            <BaseCheckbox.Root
                id={id}
                className="am-checkbox-root"
                checked={checked}
                defaultChecked={defaultChecked}
                onCheckedChange={onChange}
                disabled={disabled}
                aria-label={ariaLabel}
                {...ariaProps}
            >
                <BaseCheckbox.Indicator className="am-checkbox-indicator">
                    <svg
                        width="10"
                        height="8"
                        viewBox="0 0 10 8"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </BaseCheckbox.Indicator>
            </BaseCheckbox.Root>
            {label !== undefined && <span className="am-checkbox-label">{label}</span>}
        </label>
    );
}

export type { CheckboxProps };
