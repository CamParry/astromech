import { Slider } from './slider.js';

export type RangeInputProps = {
    value?: number;
    onChange?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    'aria-label'?: string;
};

export function RangeInput({
    value = 0,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    'aria-label': ariaLabel,
}: RangeInputProps) {
    return (
        <div className="am-slider-range">
            <div className="am-slider-range-header">
                <span className="am-slider-range-value">{value}</span>
            </div>
            <Slider
                value={value}
                min={min}
                max={max}
                step={step}
                aria-label={ariaLabel}
                onValueChange={(v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    if (next !== undefined) onChange?.(next);
                }}
            />
        </div>
    );
}
