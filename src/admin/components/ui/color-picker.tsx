import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { HexColorPicker } from 'react-colorful';

export type ColorPickerProps = {
    value?: string;
    onChange?: (value: string) => void;
};

export function ColorPicker({ value, onChange }: ColorPickerProps): React.ReactElement {
    const hex = typeof value === 'string' && value ? value : '#000000';

    return (
        <Popover.Root>
            <Popover.Trigger
                className="am-color-picker-trigger"
                aria-label={`Color: ${hex}`}
            >
                <span className="am-color-picker-swatch" style={{ backgroundColor: hex }} />
                <span className="am-color-picker-hex">{hex}</span>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner sideOffset={6}>
                    <Popover.Popup className="am-color-picker-popup">
                        <HexColorPicker color={hex} onChange={onChange ?? (() => {})} />
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
