import type { BaseFieldProps } from '@/types/index';
import { RangeInput } from '@/admin/components/ui/range-input';
import { useLabel } from '@/admin/i18n/entry-namespace';

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
