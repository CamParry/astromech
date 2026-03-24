import React from 'react';
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle as BaseToggle } from '@base-ui/react/toggle';

export type ToggleGroupItem<V extends string = string> = {
    value: V;
    icon: React.ReactNode;
    label: string;
};

export type ToggleGroupProps<V extends string = string> = {
    value: V;
    onValueChange: (value: V) => void;
    items: ToggleGroupItem<V>[];
};

export function ToggleGroup<V extends string>({
    value,
    onValueChange,
    items,
}: ToggleGroupProps<V>): React.ReactElement {
    return (
        <BaseToggleGroup
            className="am-toggle-group"
            value={[value]}
            onValueChange={(values) => {
                if (values.length > 0) onValueChange(values[0] as V);
            }}
        >
            {items.map((item) => (
                <BaseToggle
                    key={item.value}
                    value={item.value}
                    className="am-toggle-group__btn"
                    aria-label={item.label}
                >
                    {item.icon}
                </BaseToggle>
            ))}
        </BaseToggleGroup>
    );
}
