import { Popover } from '@base-ui/react/popover';
import React from 'react';
import { HexColorPicker } from 'react-colorful';
import { useFieldControl } from '@/admin/components/fields/field-control-context';

export type ColorPickerProps = {
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
};

export function ColorPicker({
    value,
    onChange,
    disabled,
}: ColorPickerProps): React.ReactElement {
    const { ariaProps } = useFieldControl();
    const hex = typeof value === 'string' && value ? value : '#000000';

    return (
        <Popover.Root>
            <Popover.Trigger
                className="am-color-picker-trigger"
                aria-label={`Color: ${hex}`}
                disabled={disabled}
                {...ariaProps}
            >
                <span
                    className="am-color-picker-swatch"
                    style={{ backgroundColor: hex }}
                />
                <span className="am-color-picker-hex">{hex}</span>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner sideOffset={6}>
                    <Popover.Popup className="am-color-picker-popup">
                        {/* eslint-disable-next-line @typescript-eslint/no-empty-function */}
                        <HexColorPicker color={hex} onChange={onChange ?? (() => {})} />
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
