import React from 'react';
import { Switch } from '@base-ui/react/switch';

type ToggleProps = {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
};

export function Toggle({ checked, defaultChecked, onChange, label, disabled }: ToggleProps): React.ReactElement {
    return (
        <label className="am-toggle">
            <Switch.Root
                className="am-toggle__root"
                checked={checked}
                defaultChecked={defaultChecked}
                onCheckedChange={onChange}
                disabled={disabled}
            >
                <Switch.Thumb className="am-toggle__thumb" />
            </Switch.Root>
            {label !== undefined && <span className="am-toggle__label">{label}</span>}
        </label>
    );
}

export type { ToggleProps };
