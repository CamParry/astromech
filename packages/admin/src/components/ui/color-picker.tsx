import { Popover } from '@base-ui/react/popover';
import React from 'react';
import { HexColorPicker } from 'react-colorful';
import { useFieldControl } from '../fields/field-control-context';

export type ColorPickerProps = {
    /** The trigger's id. */
    id?: string | undefined;
    /** The id of a label naming the trigger, which reads its colour after it. */
    'aria-labelledby'?: string | undefined;
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
};

export function ColorPicker({
    id,
    'aria-labelledby': labelledBy,
    value,
    onChange,
    disabled,
}: ColorPickerProps): React.ReactElement {
    const { ariaProps } = useFieldControl();
    const hex = typeof value === 'string' && value ? value : '#000000';
    const hexId = React.useId();
    // Named with its colour, as "Brand colour #ff0000".
    const name =
        labelledBy !== undefined
            ? { 'aria-labelledby': `${labelledBy} ${hexId}` }
            : { 'aria-label': `Color: ${hex}` };

    return (
        <Popover.Root>
            <Popover.Trigger
                id={id}
                className="am-color-picker-trigger"
                {...name}
                disabled={disabled}
                {...ariaProps}
            >
                <span
                    className="am-color-picker-swatch"
                    style={{ backgroundColor: hex }}
                />
                <span className="am-color-picker-hex" id={hexId}>
                    {hex}
                </span>
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
