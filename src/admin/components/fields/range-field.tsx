import type { BaseFieldProps } from '@/types/index.js';
import { RangeInput } from '@/admin/components/ui/range-input.js';

export function RangeField({ name, value, field, onChange }: BaseFieldProps) {
    const numValue = typeof value === 'number' ? value : (field.min ?? 0);

    return (
        <>
            <RangeInput
                value={numValue}
                min={field.min ?? 0}
                max={field.max ?? 100}
                step={field.step ?? 1}
                aria-label={field.label ?? name}
                onChange={(v) => onChange(name, v)}
            />
            <input type="hidden" name={name} value={numValue} onChange={() => {}} />
        </>
    );
}
