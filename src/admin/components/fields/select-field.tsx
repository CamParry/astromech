import type { BaseFieldProps } from '@/types/index.js';
import { Select } from '@/admin/components/ui/select';
import { useLabel } from '@/admin/i18n/entry-namespace.js';

export function SelectField({ name, value, field, required, onChange }: BaseFieldProps) {
    const label = useLabel();

    const options: { value: string; label: string }[] =
        field.options?.map((opt) => {
            if (typeof opt === 'string') {
                return { value: opt, label: opt };
            }
            return { value: opt.value, label: label(opt.label, opt.value) };
        }) || [];

    return (
        <Select
            name={name}
            value={typeof value === 'string' ? value : ''}
            onValueChange={(v) => onChange(name, v ?? '')}
            options={options}
            placeholder="Select an option..."
            required={!!required}
        />
    );
}
