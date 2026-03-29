import React from 'react';
import { Switch } from '@base-ui/react/switch';

type ToggleProps = {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
    name?: string;
    id?: string;
};

export function Toggle({ checked, defaultChecked, onChange, label, disabled, name, id }: ToggleProps): React.ReactElement {
    return (
        <label className="am-toggle">
            <Switch.Root
                className="am-toggle-root"
                checked={checked}
                defaultChecked={defaultChecked}
                onCheckedChange={onChange}
                disabled={disabled}
                name={name}
                id={id}
            >
                <Switch.Thumb className="am-toggle-thumb" />
            </Switch.Root>
            {label !== undefined && <span className="am-toggle-label">{label}</span>}
        </label>
    );
}

export type { ToggleProps };
