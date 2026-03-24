import type { BaseFieldProps, SelectOption } from '@/types/index.js';
import { Select } from '@/admin/components/ui/select';

export function SelectField({ name, value, field, required, onChange }: BaseFieldProps) {
    const options: SelectOption[] =
        field.options?.map((opt) => {
            if (typeof opt === 'string') {
                return { value: opt, label: opt };
            }
            return opt;
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
