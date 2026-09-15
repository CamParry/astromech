import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/entry-namespace';
import { RangeInput } from '../ui/range-input';

export function RangeField({ name, value, field, onChange, disabled }: BaseFieldProps) {
    const label = useLabel();
    const numValue = typeof value === 'number' ? value : (field.min ?? 0);

    return (
        <>
            <RangeInput
                value={numValue}
                min={field.min ?? 0}
                max={field.max ?? 100}
                step={field.step ?? 1}
                aria-label={label(field.label, name)}
                onChange={(v) => onChange(name, v)}
                {...(disabled !== undefined ? { disabled } : {})}
            />
            <input type="hidden" name={name} value={numValue} readOnly />
        </>
    );
}
