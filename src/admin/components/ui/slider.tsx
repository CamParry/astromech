/**
 * Slider — range input built on Base UI Slider.
 */

import React from 'react';
import { Slider as BaseSlider } from '@base-ui/react/slider';

type SliderProps = {
    label?: string;
    value?: number | number[];
    defaultValue?: number | number[];
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    onValueChange?: (value: number | number[]) => void;
    'aria-label'?: string;
};

export function Slider({
    label,
    value,
    defaultValue = 0,
    min = 0,
    max = 100,
    step = 1,
    disabled,
    onValueChange,
    'aria-label': ariaLabel,
}: SliderProps): React.ReactElement {
    const thumbCount = Array.isArray(defaultValue ?? value) ? ((defaultValue ?? value) as number[]).length : 1;

    return (
        <div className="am-slider-wrap">
            {label !== undefined && <span className="am-field__label">{label}</span>}
            <BaseSlider.Root
                value={value}
                defaultValue={defaultValue}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onValueChange={onValueChange}
                className="am-slider"
            >
                <BaseSlider.Control className="am-slider__control">
                    <BaseSlider.Track className="am-slider__track">
                        <BaseSlider.Indicator className="am-slider__indicator" />
                        {Array.from({ length: thumbCount }).map((_, i) => (
                            <BaseSlider.Thumb
                                key={i}
                                index={i}
                                className="am-slider__thumb"
                                aria-label={ariaLabel ?? label ?? `Value ${i + 1}`}
                            />
                        ))}
                    </BaseSlider.Track>
                </BaseSlider.Control>
            </BaseSlider.Root>
        </div>
    );
}

export type { SliderProps };
