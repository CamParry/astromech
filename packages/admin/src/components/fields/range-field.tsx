import type { BaseFieldProps } from 'astromech';
import { RangeInput } from '../ui/range-input';
import { useFieldControl } from './field-control-context';

export function RangeField({ name, value, field, onChange, disabled }: BaseFieldProps) {
    const { labelId } = useFieldControl();
    const numValue = typeof value === 'number' ? value : (field.min ?? 0);

    return (
        <>
            <RangeInput
                value={numValue}
                min={field.min ?? 0}
                max={field.max ?? 100}
                step={field.step ?? 1}
                aria-labelledby={labelId}
                onChange={(v) => onChange(name, v)}
                {...(disabled !== undefined ? { disabled } : {})}
            />
            <input type="hidden" name={name} value={numValue} readOnly />
        </>
    );
}
