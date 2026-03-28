import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { HexColorPicker } from 'react-colorful';
import type { BaseFieldProps } from '@/types/index.js';
import './color-field.css';

export function ColorField({ name, value, onChange }: BaseFieldProps) {
    const hex = typeof value === 'string' && value ? value : '#000000';

    return (
        <Popover.Root>
            <Popover.Trigger
                className="am-color-field-trigger"
                aria-label={`Color: ${hex}`}
            >
                <span className="am-color-field-swatch" style={{ backgroundColor: hex }} />
                <span className="am-color-field-hex">{hex}</span>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner sideOffset={6}>
                    <Popover.Popup className="am-color-field-popover">
                        <HexColorPicker color={hex} onChange={(c) => onChange(name, c)} />
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
